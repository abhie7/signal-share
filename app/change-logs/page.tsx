import { AppShell } from '@/components/share/app-shell';
import { Badge } from '@/components/ui/badge';

export const metadata = {
  title: 'Changelogs | SignalShare',
  description: 'Latest updates and improvements to SignalShare.',
};

const changelogs = [
  {
    date: 'April 3, 2026',
    version: '1.2.1',
    changes: [
      {
        type: 'fix',
        title: 'Drag & Drop Behavior Improvements',
        description:
          'Fixed an issue where the global drag-and-drop overlay would not consistently appear on certain browsers or when dragging from specific sources. Improved event handling to ensure reliable detection of drag events across all supported platforms.',
      },
      {
        type: 'fix',
        title: 'Large Folder Upload Performance',
        description:
          'Improved performance and memory usage when uploading large folders by optimizing the zipping process and streaming files directly to WebRTC without full in-memory buffering. Displaying a fallback loader for large uploads to improve user feedback during processing.',
      },
    ]
  },
  {
    date: 'March 10, 2026',
    version: 'v1.2.0',
    changes: [
      {
        type: 'new',
        title: 'Global Drag & Drop',
        description:
          'Files can now be dropped anywhere in the window to initiate transfer. Supports overlay state and immediate transfer initialization.',
      },
      {
        type: 'new',
        title: 'Folder Uploads',
        description:
          'Entire directories are accepted. Client compresses folder structure before WebRTC transmission.',
      },
      {
        type: 'new',
        title: 'Transfer History',
        description:
          'Transfers are now stored in IndexedDB to maintain session history and enable client-side retrieval without server dependency.',
      },
      {
        type: 'new',
        title: 'Confetti & Sound Feedback',
        description:
        'Added celebratory confetti animation and optional sound effects upon successful file transfer completion to improve user feedback loops.',
      },
      {
        type: 'new',
        title: 'QR Code Sharing',
        description:
        'Enabled instant session sharing via dynamically generated QR codes. Allows seamless device-to-device pairing without manual signal entry.',
      },
      {
        type: 'new',
        title: 'Theme Toggling',
        description:
        'Implemented system-aware light and dark theme switching with persistent user preference storage.',
      },
      {
        type: 'new',
        title: 'Pre-Transfer File Management Modal',
        description:
        'Added a confirmation modal allowing users to remove selected files or append additional files before initiating transfer.',
      },
      {
        type: 'new',
        title: 'Changelog Page',
        description:
        'Introduced a dedicated changelog page for structured version tracking and product evolution transparency.',
      },
      {
        type: 'improvement',
        title: 'Layout Refactor',
        description:
        'Improved grid alignment and responsive behavior across connection states.',
      },
      {
        type: 'improvement',
        title: 'Connection Dialog Alignment',
        description:
        'Corrected layout issue causing the connection request dialog to render off-center on certain viewport sizes.',
      },
      {
        type: 'improvement',
        title: 'Transfer State Feedback Refinement',
        description:
        'Improved visual clarity of connection states including awaiting peer, negotiating, connected, and transferring.',
      },
      {
        type: 'improvement',
        title: 'Session Lifecycle Handling',
        description:
        'Improved cleanup logic after completed or aborted transfers to prevent residual peer state conflicts.',
      },
      {
        type: 'tweak',
        title: 'Animated Network Flow Diagram',
        description:
        'Introduced a real-time animated network visualization to represent peer-to-peer data transfer. Improves clarity of connection states and enhances onboarding experience.',
      },
      {
        type: 'fix',
        title: 'Mobile File Upload Retry Bug',
        description:
          'Resolved issue where mobile devices failed to register file input on first selection attempt due to input event handling inconsistency.',
      }
    ]
  },
  {
    date: 'March 3, 2026',
    version: 'v1.1.2',
    changes: [
      {
        type: 'fix',
        title: 'Relay Transfer Mode',
        description:
          'Added fallback relay transfer mode for unstable or restricted peer-to-peer environments. Automatically prompts users when direct WebRTC connection degrades.',
      },
      {
        type: 'improvement',
        title: 'WebRTC Stability Enhancements',
        description:
          'Improved ICE candidate handling, retry logic, and connection timeouts to reduce failed session attempts.',
      },
      {
        type: 'improvement',
        title: 'Robust Error Handling',
        description:
          'Standardized error states and improved UI messaging for failed connections, dropped peers, and transfer interruptions.',
      }
    ]
  },
  {
    date: 'February 28, 2026',
    version: 'v1.1.1',
    changes: [
      {
        type: 'new',
        title: 'Health Check Endpoint',
        description:
          'Introduced a dedicated health check API endpoint to monitor server availability and uptime status.',
      },
      {
        type: 'new',
        title: 'Automated Health Pings',
        description:
          'Integrated node-cron to schedule periodic uptime verification and prevent cold-start latency.',
      },
      {
        type: 'improvement',
        title: 'Footer Attribution Update',
        description:
          'Updated footer to include author attribution link and improved layout consistency.',
      },
      {
        type: 'improvement',
        title: 'Analytics Configuration Update',
        description:
          'Refined analytics setup and later removed Vercel Analytics to reduce client bundle overhead.',
      },
      {
        type: 'improvement',
        title: 'Documentation Update',
        description:
          'Expanded README with updated setup instructions, architecture overview, and deployment notes.',
      },
      {
        type: 'fix',
        title: 'Type Definitions for node-cron',
        description:
          'Added missing TypeScript type definitions to improve development reliability.',
      }
    ]
  },
  {
    date: 'February 27, 2026',
    version: 'v1.0.0',
    changes: [
      {
        type: 'new',
        title: 'Project Initialization',
        description:
          'Bootstrapped project using Create Next App with initial routing, layout structure, and TypeScript configuration.',
      },
      {
        type: 'new',
        title: 'Core Application Scaffold',
        description:
          'Established foundational project structure including environment configuration, basic UI shell, and deployment setup.',
      }
    ]
  }
];

const typeStyles: Record<string, string> = {
  new: 'bg-emerald-900/70 text-emerald-400',
  feature: 'bg-cyan-900/70 text-cyan-400',
  improvement: 'bg-blue-900/70 text-blue-400',
  fix: 'bg-amber-900/70 text-amber-400',
  tweak: 'bg-violet-900/70 text-violet-400',
};

export default function ChangelogPage() {
  return (
    <AppShell>
      <main className="max-w-4xl mx-auto px-4 py-16">

        {/* Header */}
        <header className="mb-16 space-y-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight">
              Changelogs
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              App updates, improvements, and fixes.
            </p>
          </div>
        </header>

        {/* Logs */}
        <section className="space-y-20">
          {changelogs.map((log) => (
            <article key={log.version} className="space-y-8">

              {/* Version Block */}
              <div className="border-b pb-4">
                <h2 className="text-2xl font-semibold">
                  {log.version}
                </h2>
                <time className="text-sm text-muted-foreground">
                  {log.date}
                </time>
              </div>

              {/* Change List */}
              <ul className="space-y-6">
                {log.changes.map((change, index) => (
                  <li key={index} className="space-y-1">

                    <div className="flex items-center gap-3">
                      <Badge
                        className={`text-xs font-medium uppercase tracking-wide ${typeStyles[change.type]}`}
                      >
                        {change.type}
                      </Badge>
                      <h3 className="text-base font-medium">
                        {change.title}
                      </h3>
                    </div>

                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {change.description}
                    </p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  );
}