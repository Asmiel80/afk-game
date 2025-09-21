import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
// La corrección está en la siguiente línea: 'open' se importa desde 'sqlite'
import { open } from 'sqlite';

const app = express();
const PORT = process.env.PORT || 8080;

// CORS seguro: lista separada por comas en .env
const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const ok = allowed.some(a => origin.startsWith(a));
    cb(null, ok);
  }
}));
app.use(express.json());

// DB
let db;
(async () => {
  // Esta parte ya era correcta: usa el driver de sqlite3 con la función open de sqlite
  db = await open({ filename: './db.sqlite3', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS players(
    pubkey TEXT PRIMARY KEY,
    points INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0
  )`);
  console.log('DB ready');
})();

// Helpers
async function addPoints(pubkey, pts){
  const row = await db.get('SELECT * FROM players WHERE pubkey = ?', pubkey);
  if(row){
    await db.run('UPDATE players SET points = points + ?, total_points = total_points + ? WHERE pubkey = ?', pts, pts, pubkey);
  }else{
    await db.run('INSERT INTO players(pubkey, points, total_points) VALUES (?,?,?)', pubkey, pts, pts);
  }
}
async function getRanking(limit=20){
  return db.all('SELECT pubkey, points FROM players ORDER BY points DESC LIMIT ?', limit);
}

// Routes
app.post('/savePoints', async (req,res)=>{
  try{
    const { pubkey, points } = req.body || {};
    if(!pubkey || !Number.isFinite(points)) return res.status(400).json({ ok:false, error:'Faltan datos' });
    await addPoints(pubkey, Math.max(0, Math.floor(points)));
    res.json({ ok:true });
  }catch(e){ console.error(e); res.status(500).json({ ok:false, error:'DB error' }); }
});

app.get('/ranking', async (_req,res)=>{
  try{ res.json({ ok:true, ranking: await getRanking() }); }
  catch(e){ res.status(500).json({ ok:false, error:'Ranking error' }); }
});

app.post('/resetWeekly', async (_req,res)=>{
  try{ await db.run('UPDATE players SET points = 0'); res.json({ ok:true, msg:'Ranking semanal reseteado' }); }
  catch(e){ res.status(500).json({ ok:false, error:'Reset error' }); }
});

// Stub claim (activaremos AFK real cuando se libere el 20%)
app.post('/claim', async (req,res)=>{
  const { pubkey } = req.body || {};
  if(!pubkey) return res.status(400).json({ ok:false, error:'Falta pubkey' });
  return res.json({ ok:true, msg:'Claim registrado. Se activará al desbloquear Migration.' });
});

app.get('/', (_req,res)=>res.send('AFK backend OK'));
app.listen(PORT, ()=>console.log('AFK backend running on', PORT));