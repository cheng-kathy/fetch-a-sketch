# Deploying to Netlify

This guide explains how to deploy the frontend to Netlify.

## Quick Deploy

### Option 1: Deploy via Netlify UI

1. **Push your code to GitHub/GitLab/Bitbucket**
   - Make sure your repository is pushed to a Git hosting service

2. **Connect to Netlify**
   - Go to [netlify.com](https://netlify.com) and sign in
   - Click "Add new site" → "Import an existing project"
   - Connect your Git provider and select this repository

3. **Configure Build Settings**
   - Netlify will automatically detect the `netlify.toml` configuration
   - The build settings are already configured:
     - **Base directory**: `frontend`
     - **Build command**: `npm install && npm run build`
     - **Publish directory**: `frontend/dist`

4. **Deploy**
   - Click "Deploy site"
   - Netlify will install dependencies, build, and deploy your site

### Option 2: Deploy via Netlify CLI

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**
   ```bash
   netlify login
   ```

3. **Initialize and Deploy**
   ```bash
   cd frontend
   netlify init
   ```
   - Follow the prompts to link your site
   - When asked about build settings, they're already configured in `netlify.toml`

4. **Deploy**
   ```bash
   netlify deploy --prod
   ```

## Important Notes

- **Backend API**: The frontend is configured to call a Python backend API. Since Netlify only hosts static files, the API calls will fail, and the app will automatically fall back to using the bundled JSON data file (`backend/test_output_robot.json`). This is handled automatically in `deal_data.js`.

- **Data Files**: The JSON data files are bundled during the build process by Parcel, so they'll be included in the static build.

- **Environment Variables**: If you need to configure a remote backend API URL instead of localhost, you can set environment variables in Netlify:
  1. Go to Site settings → Environment variables
  2. Add `VITE_API_BASE` or similar (you'll need to update `get_data.js` to use it)

## Custom Domain

After deployment, you can:
1. Go to Site settings → Domain management
2. Add a custom domain
3. Follow Netlify's instructions to configure DNS

## Troubleshooting

- **Build fails**: Check the build logs in Netlify dashboard
- **Assets not loading**: Ensure paths in your code are relative (not absolute)
- **API errors**: This is expected - the app will use the fallback JSON data

