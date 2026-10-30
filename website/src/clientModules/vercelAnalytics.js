import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';
import { inject } from '@vercel/analytics';

// Vercel Web Analytics: page views, and the custom events that `track` sends
// from the browser (the install button's copies). Production builds only.
if (ExecutionEnvironment.canUseDOM && process.env.NODE_ENV === 'production') {
  inject({ mode: 'production', framework: 'docusaurus' });
}
