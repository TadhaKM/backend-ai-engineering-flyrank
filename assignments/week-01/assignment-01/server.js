import express from 'express';

const app = express();

const PORT = 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Hello from my backend!' });
});

app.get('/about', (req, res) => {
  res.json({ name: 'tadhagath marepalli', course: 'Computer Science' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
