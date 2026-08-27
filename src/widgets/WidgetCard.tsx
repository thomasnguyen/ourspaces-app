import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Widget } from "../lib/widgets";
import { Countdown } from "./Countdown";
import { DailyQuestion } from "./DailyQuestion";
import { Frame } from "./Frame";
import Note from "./Note";
import { Poll } from "./Poll";
import { Potluck } from "./Potluck";
import Chat from "./Chat";
import type { Identity } from "../lib/identity";

export function WidgetCard({ widget, identity }: { widget: Widget; identity: Identity }) {
  const poll = useQuery(api.votes.pollResults, { widgetId: widget._id, userId: identity.userId });
  const messages = useQuery(api.messages.listMessages, { spaceId: widget.spaceId, widgetId: widget._id });
  const vote = useMutation(api.votes.vote);
  const claimItem = useMutation(api.widgets.claimItem);
  const answerDaily = useMutation(api.widgets.answerDaily);
  const sendMessage = useMutation(api.messages.sendMessage);
  const promoteMessage = useMutation(api.messages.promoteMessage);

  if (widget.type === "frame") return <Frame data={widget.data} />;
  if (widget.type === "note") return <Note data={widget.data} />;
  if (widget.type === "countdown") return <Countdown data={widget.data} />;
  if (widget.type === "poll") return <Poll data={widget.data} results={poll?.results} currentOptionId={poll?.currentOptionId} onVote={(optionId) => void vote({ widgetId: widget._id, userId: identity.userId, optionId })} />;
  if (widget.type === "potluck") return <Potluck data={widget.data} onClaim={(itemId) => void claimItem({ widgetId: widget._id, itemId, userId: identity.userId, name: identity.name })} />;
  if (widget.type === "dailyQuestion") return <DailyQuestion data={widget.data} onAnswer={(text) => void answerDaily({ widgetId: widget._id, name: identity.name, text })} />;
  if (widget.type === "chat") return <Chat messages={(messages ?? []) as never[]} onSend={(text) => void sendMessage({ spaceId: widget.spaceId, widgetId: widget._id, userId: identity.userId, text, authorName: identity.name, authorColor: identity.color })} onPromote={(messageId) => void promoteMessage({ messageId: messageId as never })} />;
  return null;
}
