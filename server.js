async function start() {
  const { createServer } = await import('node:http');
  const { default: next } = await import('next');

  const port = parseInt(process.env.PORT, 10) || 3000;
  const dev = process.env.NODE_ENV !== 'production';
  const app = next({ dev });
  const handle = app.getRequestHandler();

  await app.prepare();
  createServer((req, res) => {
    handle(req, res);
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
