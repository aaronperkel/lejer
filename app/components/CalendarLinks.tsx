import { CalendarIcon } from "@/app/components/icons";
import { calendarLinks } from "@/lib/ics";

/**
 * Subscribe buttons for the viewer's own calendar feed: webcal:// opens Apple Calendar (and
 * most desktop apps), Google takes the feed by URL. The token is the viewer's alone, rendered
 * only on their own pages.
 */
export default function CalendarLinks({ token, className = "" }: { token: string; className?: string }) {
  const links = calendarLinks(token);
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <a href={links.webcal} className="btn btn-sm">
        <CalendarIcon />
        Apple Calendar
      </a>
      <a href={links.google} className="btn btn-sm" target="_blank" rel="noopener noreferrer">
        <CalendarIcon />
        Google Calendar
      </a>
    </div>
  );
}
