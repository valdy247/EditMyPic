# AI Video Studio (experimental)
Runway integration on the Expo Router /video route.

## Setup
1. Deploy Expo Router server/API routes to a Node-capable host.
2. Set RUNWAYML_API_SECRET in server environment variables, never EXPO_PUBLIC_*.
3. Configure app requests to reach the deployed server. Relative /api paths work in web deployment; native builds require a configured HTTPS backend base URL.
4. Visit /video in the web build and submit a 5-second test.
5. Verify Runway account model access, supported ratios and pricing.

## Scope
Text-to-video (gen4.5), image-to-video (gen4_turbo, public HTTPS image URL), 5/10 second clips, task polling, open resulting output URL.
No claim of production readiness: add user authentication, persistent database, server-side billing quotas, rate limiting, signed uploads, and job ownership validation before exposing publicly. The GET endpoint currently accepts any known task ID and is for private testing only. Outputs may expire. No automated long-video stitching, voice generation, lip sync, or local image upload.
