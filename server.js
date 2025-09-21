import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const app = express();
const PORT = process.env.PORT || 8080;

const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const ok = allowed.some(a => origin.startsWith(a));
    cb(null, ok);
  }
}));
app.use(express.json());

let db;
(async () => {
  db = await open({ filename: './db.sqlite3', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS players(
    pubkey TEXT PRIMARY KEY,
    points INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0
  )`);
  console.log('DB ready');
})();

async function setPoints(pubkey, newTotal) {
  const row = await db.get('SELECT total_points FROM players WHERE pubkey = ?', pubkey);
  if (row) {
    // Calculamos cuánto ha cambiado para el ranking semanal
    const difference = newTotal - row.total_points;
    await db.run('UPDATE players SET points = points + ?, total_points = ? WHERE pubkey = ?', difference, newTotal, pubkey);
  } else {
    // Si es un jugador nuevo, el semanal y el total son iguales
    await db.run('INSERT INTO players(pubkey, points, total_points) VALUES (?, ?, ?)', pubkey, newTotal, newTotal);
  }
}

async function getRanking(limit=20){
  // El ranking se basa en los puntos semanales (points)
  return db.all('SELECT pubkey, points FROM players ORDER BY points DESC LIMIT ?', limit);
}

// Función para obtener los puntos totales de un jugador
async function getPoints(pubkey){
  const row = await db.get('SELECT total_points FROM players WHERE pubkey = ?', pubkey);
  // Devuelve el total de puntos, que es el valor persistente
  return row || { total_points: 0 };
}

// Ruta para guardar puntos (ahora recibe solo los puntos ganados en la sesión)
app.post('/savePoints', async (req,res)=>{
  try{
    const { pubkey, points } = req.body || {}; // 'points' ahora es el nuevo total
    if(!pubkey || !Number.isFinite(points)) return res.status(400).json({ ok:false, error:'Faltan datos' });

    // Llamamos a la nueva función que establece el total
    await setPoints(pubkey, Math.max(0, Math.floor(points)));
    res.json({ ok:true });
  }catch(e){ console.error(e); res.status(500).json({ ok:false, error:'DB error' }); }
});

// <<< AÑADE ESTA NUEVA RUTA >>>
app.get('/price/:tokenMint', async (req, res) => {
  try {
    const { tokenMint } = req.params;
    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyB7u6T';
    const apiURL = `https://price.jup.ag/v4/price?ids=${tokenMint}&vsToken=${usdcMint}`;

    const fetchRes = await fetch(apiURL);
    if (!fetchRes.ok) {
      throw new Error(`Jupiter API failed with status ${fetchRes.status}`);
    }
    const data = await fetchRes.json();

    const price = data.data[tokenMint]?.price;

    if (typeof price !== 'number') {
      return res.status(404).json({ ok: false, error: 'Price not found' });
    }

    res.json({ ok: true, price: price });

  } catch(e) {
    console.error("Price fetch error:", e);
    res.status(500).json({ ok: false, error: 'Failed to fetch price' });
  }
});

app.get('/ranking', async (_req,res)=>{
  try{ res.json({ ok:true, ranking: await getRanking() }); }
  catch(e){ res.status(500).json({ ok:false, error:'Ranking error' }); }
});

// Ruta para que el frontend consulte los puntos totales al iniciar
app.get('/points/:pubkey', async (req, res) => {
  try {
    const { pubkey } = req.params;
    if (!pubkey) return res.status(400).json({ ok: false, error: 'Falta pubkey' });
    const result = await getPoints(pubkey);
    res.json({ ok: true, points: result.total_points });
  } catch(e) {
    res.status(500).json({ ok: false, error: 'DB error' });
  }
});

// Resetea el ranking semanal
app.post('/resetWeekly', async (_req,res)=>{
  try{ await db.run('UPDATE players SET points = 0'); res.json({ ok:true, msg:'Ranking semanal reseteado' }); }
  catch(e){ res.status(500).json({ ok:false, error:'Reset error' }); }
});

app.post('/claim', async (req,res)=>{
  const { pubkey } = req.body || {};
  if(!pubkey) return res.status(400).json({ ok:false, error:'Falta pubkey' });
  return res.json({ ok:true, msg:'Claim registrado. Se activará al desbloquear Migration.' });
});

app.get('/', (_req,res)=>res.send('AFK backend OK'));
app.listen(PORT, ()=>console.log('AFK backend running on', PORT));
