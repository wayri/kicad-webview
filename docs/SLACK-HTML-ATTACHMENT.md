# Sharing a self-contained HTML snapshot in Slack

A self-contained HTML file can include the viewer, styles, a PCB snapshot and applicable license notices. Upload the file as an attachment and open its preview. In a tested Slack web client the preview ran JavaScript and WebGL, including PCB/3D switching, selection, layers, inspection, orbit and pan. Availability and behavior can vary by workspace and client.

The tested snapshot includes a PCB and labelled component proxies, not schematic sheets or external 3D models. It uses a restrictive content security policy with `connect-src 'none'` and does not fetch the design, a CDN or a viewer service. Snapshots do not update automatically; regenerate one to incorporate changes. A general-purpose export API is not yet provided. Share only designs and notices you are authorized to distribute.

Native desktop and mobile clients, physical mobile gestures, other workspaces and larger bundles have not been verified. Automatic link previews are a separate integration requiring a configured receiver; see [Slack deployment](../integrations/slack/DEPLOYMENT.md).
