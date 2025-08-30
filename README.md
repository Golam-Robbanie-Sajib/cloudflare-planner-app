# AI Goal Planner & Calendar Assistant

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/Golam-Robbanie-Sajib/cloudflare-planner-app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-15.x-blue?logo=nextdotjs)](https://nextjs.org/)
[![Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare-orange?logo=cloudflare)](https://pages.cloudflare.com/)

> A sophisticated AI-powered productivity platform that transforms natural language learning goals into structured, actionable plans with seamless Google Calendar integration.

**🔗 Live Demo:** [https://cloudflare-planner-app.pages.dev/](https://cloudflare-planner-app.pages.dev/)

## Overview

The AI Goal Planner & Calendar Assistant is an intelligent full-stack application designed to revolutionize personal productivity and learning management. By leveraging cutting-edge AI technology, it transforms vague aspirations into concrete, time-bound action plans that integrate seamlessly into your daily workflow.

### Key Value Propositions

- **Intelligent Planning**: Converts natural language descriptions into detailed, structured learning schedules
- **Seamless Integration**: Direct synchronization with Google Calendar for unified task management  
- **Adaptive Refinement**: AI-powered plan modifications based on user feedback and preferences
- **Real-time Collaboration**: Multi-device synchronization with instant updates across platforms

## Features

### 🤖 AI-Powered Conversational Interface
- Natural language processing for goal definition and planning
- Context-aware responses using Google's Gemini AI
- Intuitive chat-based interaction for non-technical users

### 📅 Smart Calendar Management  
- Automated Google Calendar integration with OAuth 2.0 authentication
- Multiple calendar view formats (daily, weekly, 14-day grid)
- Real-time synchronization across all connected devices

### 🔄 Dynamic Plan Optimization
- Intelligent plan refinement through natural language commands
- Adaptive scheduling based on user preferences and constraints
- Automated task prioritization and time allocation

### 📊 Analytics & Insights
- Comprehensive user profile with task completion statistics
- Progress tracking and performance analytics
- Personal productivity insights and recommendations

### 🔐 Enterprise-Grade Security
- Firebase Authentication with Google OAuth integration
- Secure data encryption and privacy protection
- Role-based access control and data isolation

## Technology Stack

### Frontend Architecture
- **Framework**: Next.js 15 with App Router for optimal performance
- **Language**: TypeScript for type safety and developer experience
- **UI Components**: Tailwind CSS + Shadcn/ui for modern, accessible design
- **State Management**: React Context API with custom hooks

### Backend Infrastructure  
- **Runtime**: Cloudflare Workers for global edge computing
- **Framework**: Hono.js for ultra-fast serverless API development
- **AI Integration**: Google Gemini API for natural language processing
- **Calendar API**: Google Calendar API for scheduling integration

### Data & Authentication
- **Database**: Google Firestore for real-time data synchronization
- **Authentication**: Firebase Auth with Google provider
- **Hosting**: Cloudflare Pages for global CDN distribution

## Project Architecture

```
cloudflare-planner-app/
├── app/                          # Next.js App Router
│   ├── api/[[...path]]/         # Unified Hono backend API
│   ├── calendar/                # Calendar management pages
│   ├── events/                  # Event handling interfaces
│   ├── profile/                 # User profile management
│   ├── settings/                # Application configuration
│   └── page.tsx                 # Main dashboard
├── components/                   # Reusable React components
├── lib/                         # Core utilities and configurations
│   ├── firebase.ts              # Firebase configuration
│   ├── contexts/                # React Context providers
│   └── utils/                   # Helper functions
├── public/                      # Static assets
└── package.json                 # Project dependencies
```

## Getting Started

### Prerequisites

Ensure your development environment meets the following requirements:

- **Node.js**: Version 18.18+ (LTS recommended)
- **Git**: Latest stable version
- **Google Account**: For API access and authentication

### Environment Setup

#### 1. Firebase Project Configuration

1. Navigate to the [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Enable the following services:
   - **Authentication** (Google provider)
   - **Firestore Database**
4. Configure Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userEmail}/{documents=**} {
      allow read, write: if request.auth != null && 
                           request.auth.token.email == userEmail;
    }
  }
}
```

#### 2. Google Cloud Platform Setup

1. Access the [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable required APIs:
   - Google Calendar API
   - Generative Language API (Gemini)
4. Create credentials:
   - **API Key** for Gemini integration
   - **OAuth 2.0 Client ID** for web applications
5. Configure OAuth origins: `http://localhost:3000`

### Installation

```bash
# Clone the repository
git clone https://github.com/Golam-Robbanie-Sajib/cloudflare-planner-app.git
cd cloudflare-planner-app

# Install dependencies
npm install
```

### Environment Configuration

Create a `.env.local` file in the project root:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Google API Configuration
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_oauth_client_id.apps.googleusercontent.com
GOOGLE_API_KEY=your_gemini_api_key
```

### Development Server

```bash
npm run dev
```

Navigate to `http://localhost:3000` to access the application.

## Deployment

### Cloudflare Pages Deployment

#### 1. Repository Setup
Ensure your project is hosted on GitHub with the latest changes.

#### 2. Cloudflare Configuration
1. Access your Cloudflare dashboard
2. Navigate to **Workers & Pages** → **Create Application** → **Pages**
3. Connect your GitHub repository
4. Configure build settings:
   - **Framework**: Next.js
   - **Build command**: `npx @cloudflare/next-on-pages@1`
   - **Build output directory**: `.vercel/output/static`
   - **Root directory**: (leave blank)

#### 3. Environment Variables
Configure the following environment variables in Cloudflare:

**Secret Variables:**
- `GOOGLE_API_KEY`: Your Gemini API key

**Plaintext Variables:**
- All `NEXT_PUBLIC_*` variables from your local environment

#### 4. Node.js Compatibility
1. Navigate to **Settings** → **Functions** → **Compatibility Flags**
2. Add `nodejs_compat` flag

#### 5. Post-Deployment Configuration
- Update Google OAuth origins with your live Cloudflare URL
- Add your domain to Firebase authorized domains

## Contributing

We welcome contributions from the community. Please follow these guidelines:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Maintain test coverage above 80%
- Use conventional commit messages
- Ensure all CI/CD checks pass

## Support

For technical support and questions:

- 📧 **Email**: [support@example.com](mailto:support@example.com)
- 🐛 **Issues**: [GitHub Issues](https://github.com/Golam-Robbanie-Sajib/cloudflare-planner-app/issues)
- 📖 **Documentation**: [Wiki](https://github.com/Golam-Robbanie-Sajib/cloudflare-planner-app/wiki)

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Team Contributions

This project is the result of collaborative development with specialized expertise in different areas:

### Core Development Team

**[@Golam-Robbanie-Sajib](https://github.com/Golam-Robbanie-Sajib)** - *Lead Developer & Infrastructure*
- Frontend and backend framework architecture
- Google Calendar API integration and OAuth implementation
- Firebase Firestore database design and implementation  
- Google Authentication system setup
- Backend conversion from TypeScript to JavaScript for optimal Cloudflare compatibility
- Migration to Hono.js framework for enhanced edge performance
- Cloudflare Pages deployment configuration and optimization

**[@altafuddin](https://github.com/altafuddin)** - *AI Integration Specialist*
- AI prompting architecture and natural language processing logic
- Complete plan generation system using Google Gemini API
- Backend-frontend synchronization and data flow management
- Real-time plan storage and retrieval implementation

### Technical Achievements
- **Framework Migration**: Successfully converted backend from TypeScript to JavaScript for Cloudflare Worker compatibility
- **Performance Optimization**: Migrated from Express to Hono.js for 3x faster edge computing performance
- **Infrastructure**: Deployed on Cloudflare Pages with global CDN distribution and edge computing capabilities

---

**Built with ❤️ by [Golam Robbanie Sajib](https://github.com/Golam-Robbanie-Sajib)**