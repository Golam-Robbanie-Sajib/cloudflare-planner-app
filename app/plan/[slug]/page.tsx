// app/plan/[slug]/page.tsx
//
// Server-component wrapper whose only job is to declare `runtime = 'edge'`
// (required by the Cloudflare Pages adapter for every dynamic route) and
// render the client view. Splitting it this way keeps the route segment
// config valid — Next.js doesn't accept route config exports from
// `"use client"` files.

import PlanView from "./plan-view"

export const runtime = "edge"

export default function PublicPlanPage() {
  return <PlanView />
}
