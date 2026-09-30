import express from 'express';
import { createNodeHandler } from 'docusaurus-plugin-mcp-server/adapters/node';

const app = express();
app.use(express.json());
app.all('/mcp', createNodeHandler({ artifactsDir: './build/mcp' }));
app.listen(3456);
