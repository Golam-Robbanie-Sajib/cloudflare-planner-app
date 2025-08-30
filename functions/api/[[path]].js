import app from '../../api/main_api'; // Import your existing Express app

// This is the Cloudflare Pages function handler
export const onRequest = async (context) => {
  // The 'app' object is your full Express application.
  // We are essentially passing the request through it.
  return app(context.request, context.env, context);
};