const {getDb,applySchema}=require('./lib/db');
const {buildApp}=require('./app');
const db=applySchema(getDb());
const host=process.env.HOST||'0.0.0.0';
const port=Number(process.env.PORT)||3000;
buildApp(db).listen(port,host,()=>console.log(`VoyBus API escuchando en http://${host}:${port}`));
