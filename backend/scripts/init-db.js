const {applySchema,closeDb}=require('../src/lib/db');
applySchema();
console.log('Modelo SQLite inicializado; no modifica el contrato de 18 tablas.');
closeDb();
