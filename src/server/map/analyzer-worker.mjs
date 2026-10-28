// Worker threads cannot take `--import tsx`, so this plain-JavaScript entry registers tsx
// in the worker and then loads the TypeScript worker.
import { register } from 'tsx/esm/api';

register();
await import('./analyzer-worker.ts');
