// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));
app.use('/media', express.static(path.join(__dirname, '../public/media'))); 