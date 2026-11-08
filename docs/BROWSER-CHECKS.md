# Browser validation

Browser checks have covered PCB, schematic and CAM views; component, pad and net inspection; layer controls; 3D switching, camera controls and measurement; responsive embeds; linked selections; and interactive demonstrations. Slack and Notion web clients have also displayed an interactive self-contained HTML snapshot. Coverage varies by browser and host; these observations do not establish universal compatibility or engineering fidelity.

To reproduce, build and serve the examples as described in the [main guide](../README.md). Load a permitted design and exercise the views and controls relevant to your use case, including error handling, narrow viewports and the host's iframe and CORS policies. Run `npm run build:3d`, `npm run build` and `npm test` for the automated checks. See [integration setup](APP-INTEGRATIONS-BETA.md) for host-specific checks.

Physical iOS and Android touch gestures and native mobile clients remain unverified. WebGL behavior, GPU support, font rendering, model fidelity and host sandbox restrictions can vary. A local or mocked test does not establish support in a third-party host. Never upload private designs to a public viewer without authorization.
