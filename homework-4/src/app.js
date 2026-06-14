import express from 'express';
import { readFile } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

export function createApp() {
  const app = express();
  app.use(express.json());

  app.post('/notes', (req, res) => {
    const { title, body, tag } = req.body ?? {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    res.status(201).json(store.createNote({ title, body, tag }));
  });

  app.get('/notes', (req, res) => {
    const { tag, limit, offset } = req.query;
    res.json(store.listNotes({ tag, limit, offset }));
  });

  app.get('/notes/:id', (req, res) => {
    const note = store.getNote(Number(req.params.id));
    if (!note) return res.status(404).json({ error: 'not found' });
    res.json(note);
  });

  app.delete('/notes/:id', (req, res) => {
    const ok = store.deleteNote(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  });

  // SECURITY (CRITICAL): path traversal. `file` is joined onto dataDir with
  // no validation, so `?file=../../package.json` escapes the data directory.
  app.get('/notes/:id/backup', (req, res) => {
    const file = req.query.file;
    const full = path.resolve(dataDir, String(file));
    if (!full.startsWith(dataDir + path.sep)) {
      return res.status(400).json({ error: 'invalid file path' });
    }
    readFile(full, 'utf8', (err, data) => {
      if (err) return res.status(404).json({ error: 'backup not found' });
      res.type('text/plain').send(data);
    });
  });

  return app;
}
