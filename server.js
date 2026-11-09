import { app } from './app.js';

const port = process.env.PORT || process.env.API_PORT || 3001;
app.listen(port, () => console.log(`VIT Hostel app running at http://localhost:${port}`));
