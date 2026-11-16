const express = require('express');
const auth = require('./services/auth');
const catalog = require('./services/transport');
const trips = require('./services/travel');
const { ApiError } = require('./lib/errors');
const { createMartinRouter } = require('./modules/martin.routes');
const { createNodeSqliteAdapter } = require('./modules/martin-common/nodeSqliteAdapter');

function buildApp(db) {
  const app=express();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    const origins=(process.env.CORS_ORIGIN||'*').split(',').map(s=>s.trim());
    const origin=req.get('Origin');
    if(origins.includes('*')) res.setHeader('Access-Control-Allow-Origin','*');
    else if(origin&&origins.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,PATCH,OPTIONS');
    if(req.method==='OPTIONS')return res.sendStatus(204);
    next();
  });
  app.use(express.json({limit:'32kb'}));
  const api=express.Router();
  const requireAny=auth.middleware(db,['passenger','guest']);
  const requireRegistered=auth.middleware(db,['passenger']);
  const requireAuth=auth.middleware(db);
  // Límite simple de intentos de sesión para el entorno local; reemplazar por almacén central en producción.
  const loginAttempts=new Map();
  api.post('/auth/login',(req,res)=>{
    const key=req.ip||'local';
    const entry=loginAttempts.get(key)||{attempts:0,until:0};
    if(Date.now()<entry.until)throw new ApiError(429,'LOGIN_RATE_LIMIT','Demasiados intentos. Vuelve a intentar más tarde.');
    try {
      const data=auth.login(db,req.body?.email,req.body?.password);
      loginAttempts.delete(key); res.json({data});
    } catch(error) {
      if(error.code==='INVALID_CREDENTIALS'){
        entry.attempts++;entry.until=entry.attempts>=5?Date.now()+60000:0;
        loginAttempts.set(key,entry);
      }
      throw error;
    }
  });
  api.post('/auth/guest',(_req,res)=>res.status(201).json({data:auth.guest(db)}));
  api.post('/auth/logout',requireAuth,(req,res)=>{auth.revoke(db,req.rawToken,req.actor);res.json({data:{loggedOut:true}});});
  api.get('/auth/me',requireAuth,(req,res)=>res.json({data:auth.me(req.actor)}));
  api.get('/lines',(req,res)=>res.json(catalog.lines(db,req.query)));
  api.get('/lines/:lineId',(req,res)=>res.json({data:catalog.line(db,req.params.lineId)}));
  api.get('/lines/:lineId/routes',(req,res)=>res.json({data:catalog.lineRoutes(db,req.params.lineId)}));
  api.get('/routes/:routeId',(req,res)=>res.json({data:catalog.route(db,req.params.routeId)}));
  api.get('/stops',(req,res)=>res.json(catalog.stops(db,req.query)));
  api.get('/stops/:stopId',(req,res)=>res.json({data:catalog.stop(db,req.params.stopId)}));
  api.get('/me/favorite-stops',requireRegistered,(req,res)=>res.json({data:catalog.favorites(db,req.actor.id)}));
  api.put('/me/favorite-stops/:stopId',requireRegistered,(req,res)=>res.json({data:catalog.addFavorite(db,req.actor.id,req.params.stopId)}));
  api.delete('/me/favorite-stops/:stopId',requireRegistered,(req,res)=>res.json({data:catalog.deleteFavorite(db,req.actor.id,req.params.stopId)}));
  api.get('/vehicles/resolve/:vehicleCode',(req,res)=>res.json({data:trips.resolveVehicle(db,req.params.vehicleCode)}));
  api.post('/trip-links',requireAny,(req,res)=>res.status(201).json({data:trips.link(db,req.actor,req.body?.vehicleCode)}));
  api.get('/me/trip-link',requireAny,(req,res)=>res.json({data:trips.currentLink(db,req.actor)}));
  api.delete('/me/trip-link',requireAny,(req,res)=>res.json({data:trips.unlink(db,req.actor)}));
  api.get('/me/trip-link/stops',requireAny,(req,res)=>res.json({data:trips.futureStops(db,req.actor)}));
  api.post('/me/stop-requests',requireAny,(req,res)=>res.status(201).json({data:trips.submitRequest(db,req.actor,req.body)}));
  api.get('/me/stop-request',requireAny,(req,res)=>res.json({data:trips.latestRequest(db,req.actor)}));
  app.use('/api/v1',api);
  // Martín: vehículos, conductor, GPS, alertas y administración.
  // Reutiliza la misma BD y los mismos tokens que las rutas de Gianny.
  const martinAuth = {
    requireRole: (...roles) => auth.middleware(db, roles),
    getActor: (req) => ({ userId: req.actor.id, role: req.actor.role }),
  };
  app.use('/api/v1', createMartinRouter({
    db: createNodeSqliteAdapter(db), auth: martinAuth,
  }));
  app.get('/health',(_req,res)=>res.json({status:'ok',service:'voybus-gianny',database:'sqlite'}));
  app.use((_req,_res,next)=>next(new ApiError(404,'NOT_FOUND','Recurso no encontrado.')));
  app.use((error,_req,res,_next)=>{
    if(error.type==='entity.parse.failed')return res.status(400).json({error:{code:'INVALID_JSON',message:'El cuerpo JSON no es válido.',details:{}}});
    if(error.type==='entity.too.large')return res.status(413).json({error:{code:'PAYLOAD_TOO_LARGE',message:'La petición es demasiado grande.',details:{}}});
    if(error instanceof ApiError)return res.status(error.status).json({error:{code:error.code,message:error.message,details:error.details}});
    if(error.code==='SQLITE_CONSTRAINT_UNIQUE'||error.code==='ERR_SQLITE_ERROR'&&/UNIQUE constraint failed/.test(error.message))
      return res.status(409).json({error:{code:'CONFLICT',message:'Conflicto con datos existentes.',details:{}}});
    console.error('API_ERROR',error.code||error.name||'Unknown');
    res.status(500).json({error:{code:'INTERNAL_ERROR',message:'No se pudo completar la operación.',details:{}}});
  });
  return app;
}
module.exports={buildApp};
