import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Widget } from "../lib/widgets";
import { Countdown } from "./Countdown";
import { DailyQuestion } from "./DailyQuestion";
import { Frame } from "./Frame";
import Note from "./Note";
import { Poll } from "./Poll";
import { Potluck } from "./Potluck";

export function WidgetCard({ widget }: { widget: Widget }) {
  const results = useQuery(api.votes.pollResults, { widgetId: widget._id });

  if (widget.type === "frame") return <Frame data={widget.data} />;
  if (widget.type === "note") return <Note data={widget.data} />;
  if (widget.type === "countdown") return <Countdown data={widget.data} />;
  if (widget.type === "poll") return <Poll data={widget.data} results={results} />;
  if (widget.type === "potluck") return <Potluck data={widget.data} />;
  if (widget.type === "dailyQuestion") return <DailyQuestion data={widget.data} />;
  return null;
}
