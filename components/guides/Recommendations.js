import { cn } from "@/lib/utils"
import Markdown from '../Markdown'
// import { IoThumbsDown, IoThumbsUp } from "react-icons/io5";
import { ThumbsUp, ThumbsDown } from "lucide-react";

export const Recommendations = ({ items }) => {
  if (!items.some(item => item.content)) return null

  const hasMultipleItems = items.filter(item => item.content).length > 1

  return (
    <div className={cn(
      "grid gap-2 mb-2 recommendations text-sm",
      hasMultipleItems ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
    )}>
      {items.map((item, index) => (
        <RecommendationItem key={index} {...item} />
      ))}
    </div>
  )
}

export const RecommendationItem = ({ type, content, className }) => {
  if (!content) return null

  const styles = {
    do: "text-success bg-success/10",
    dont: "text-destructive bg-destructive/10",
    empty: "text-transparent bg-transparent",
  }

  const Icon = type === "do" ? ThumbsUp : ThumbsDown

  return (
    <div className={cn(
      "h-full font-semibold rounded-md p-3 py-2",
      styles[type],
      className
    )}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 shrink-0 mt-0.5" />
        <Markdown inlineOnly={true} content={`${type === "do" ? "DO" : "DO NOT"}: ${content}`} />
      </div>
    </div>
  )
}
