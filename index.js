const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path')
const crypto = require('crypto');
const hbs = require("hbs");

const app = express();
const port = process.env.PORT || 3000


app.use(express.static(path.join(__dirname, "public")));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));


hbs.registerHelper("json", function (context) {
  return JSON.stringify(context);
});

// ---------- SQLite setup ----------
const db = new sqlite3.Database('./flappy.db', (err) => {
  if (err) console.error(err);
  else console.log('Connected to SQLite DB');
});

// Table with BLOB columns
db.run(`CREATE TABLE IF NOT EXISTS games (
  id TEXT NOT NULL,
  game_name TEXT NOT NULL,
  creator_name TEXT,
  background BLOB,
  bird BLOB,
  ground BLOB,
  tube1 BLOB,
  tube2 BLOB,
  sfx_hit BLOB,
  sfx_point BLOB,
  sfx_wing BLOB,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// ---------- Multer setup (memory storage) ----------
const storage = multer.memoryStorage(); // store files in memory
const upload = multer({ storage: storage });

const cpUpload = upload.fields([
  { name: 'background', maxCount: 1 },
  { name: 'bird', maxCount: 1 },
  { name: 'ground', maxCount: 1 },
  { name: 'tube1', maxCount: 1 },
  { name: 'tube2', maxCount: 1 },
  { name: 'hit', maxCount: 1 },
  { name: 'point', maxCount: 1 },
  { name: 'wing', maxCount: 1 },
]);

var gameCount

function updateGameCount() {
  db.get('SELECT COUNT(*) AS count FROM games', (err, row) => {
    if (err) {
      console.error(err);
    } else {
      gameCount = row.count
    }
  });
}

setInterval(updateGameCount, 5000)

app.get('/count', (req, res) => res.send(gameCount))

// ---------- Handle POST ----------
app.post('/create', cpUpload, (req, res) => {
  const body = req.body;
  const files = req.files;

  const now = new Date().toISOString();
  const randomInt = Math.floor(Math.random() * 1000000);
  const combined = `${now}-${randomInt}`;
  const hash = crypto.createHash('md5').update(combined).digest('hex');

  const gameData = {
    game_name: body.gameName,
    creator_name: body.creatorName || null,
    background: files.background ? files.background[0].buffer : null,
    bird: files.bird ? files.bird[0].buffer : null,
    ground: files.ground ? files.ground[0].buffer : null,
    tube1: files.tube1 ? files.tube1[0].buffer : null,
    tube2: files.tube2 ? files.tube2[0].buffer : null,
    sfx_hit: files.hit ? files.hit[0].buffer : null,
    sfx_point: files.point ? files.point[0].buffer : null,
    sfx_wing: files.wing ? files.wing[0].buffer : null
  };

  const stmt = db.prepare(`INSERT INTO games
    (id, game_name, creator_name, background, bird, ground, tube1, tube2, sfx_hit, sfx_point, sfx_wing)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

  stmt.run(
    hash,
    gameData.game_name,
    gameData.creator_name,
    gameData.background,
    gameData.bird,
    gameData.ground,
    gameData.tube1,
    gameData.tube2,
    gameData.sfx_hit,
    gameData.sfx_point,
    gameData.sfx_wing,
    function (err) {
      if (err) {
        console.error(err);
        res.status(500).send('DB error');
      } else {
        res.render('uploaded', { game_id: hash, game_name: gameData.game_name });
      }
    });

  stmt.finalize();
});


app.get('/play', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send('Missing game ID');

  db.get('SELECT * FROM games WHERE id=?', [id], (err, row) => {
    if (err || !row) return res.status(404).send('Game not found');

    // Convert BLOBs to base64 data URLs
    const background = row.background ? `data:image/png;base64,${row.background.toString('base64')}` : null;
    const bird = row.bird ? `data:image/png;base64,${row.bird.toString('base64')}` : null;
    const ground = row.ground ? `data:image/png;base64,${row.ground.toString('base64')}` : null;
    const tube1 = row.tube1 ? `data:image/png;base64,${row.tube1.toString('base64')}` : null;
    const tube2 = row.tube2 ? `data:image/png;base64,${row.tube2.toString('base64')}` : null;
    const sfx_hit = row.sfx_hit ? true : null;
    const sfx_point = row.sfx_point ? true : null;
    const sfx_wing = row.sfx_wing ? true : null;

    var game_data = {
      game_id: id,
      game_name: row.game_name,
      game_creator: row.creator_name,
      background,
      bird,
      ground,
      tube1,
      tube2,
      sfx_hit,
      sfx_point,
      sfx_wing
    }

    res.render('game', { game_data })
  });
});

app.get('/assets/custom/:id/:asset', (req, res) => {
  const { id, asset } = req.params;
  const columnMap = {
    'sfx_hit.mp3': { col: 'sfx_hit', type: 'audio/mpeg' },
    'sfx_point.mp3': { col: 'sfx_point', type: 'audio/mpeg' },
    'sfx_wing.mp3': { col: 'sfx_wing', type: 'audio/mpeg' }
  };

  const entry = columnMap[asset];
  if (!entry) return res.status(404).send('Unknown asset');

  db.get(`SELECT ${entry.col} AS blob FROM games WHERE id=?`, [id], (err, row) => {
    if (err || !row || !row.blob) return res.status(404).send('Not found');
    res.setHeader('Content-Type', entry.type);
    res.send(row.blob);
  });
});


// ---------- Start server ----------
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

