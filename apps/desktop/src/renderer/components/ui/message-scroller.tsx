"use client";

import * as React from "react";
import {
  MessageScroller as MessageScrollerPrimitive,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from "@shadcn/react/message-scroller";
import { ArrowDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function MessageScrollerProvider(
  props: React.ComponentProps<typeof MessageScrollerPrimitive.Provider>,
) {
  return <MessageScrollerPrimitive.Provider {...props} />;
}

function MessageScroller({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Root>) {
  return (
    <MessageScrollerPrimitive.Root
      data-slot="message-scroller"
      className={cn(
        "group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

function MessageScrollerViewport({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Viewport>) {
  return (
    <MessageScrollerPrimitive.Viewport
      data-slot="message-scroller-viewport"
      className={cn(
        // No contain-content: size containment + streaming autoscroll collapses scrollHeight
        // mid-turn (content “eaten”, cannot scroll until remount).
        // No scroll-fade-b: permanent bottom mask fades the latest AI tokens while pinned
        // to the bottom; composer-dock-fade is gated on data-scrollable~="end" instead.
        "size-full min-h-0 min-w-0 scrollbar-thin scrollbar-gutter-stable overflow-y-auto overscroll-contain data-autoscrolling:scrollbar-none",
        className,
      )}
      {...props}
    />
  );
}

function MessageScrollerContent({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Content>) {
  return (
    <MessageScrollerPrimitive.Content
      data-slot="message-scroller-content"
      className={cn("flex h-max min-h-full flex-col gap-8", className)}
      {...props}
    />
  );
}

function MessageScrollerItem({
  className,
  scrollAnchor = false,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Item>) {
  return (
    <MessageScrollerPrimitive.Item
      data-slot="message-scroller-item"
      scrollAnchor={scrollAnchor}
      className={cn(
        // Never flex-shrink or content-visibility-skip: streaming rows must report real
        // height or MessageScroller under-counts scrollHeight and earlier messages vanish.
        "min-w-0 shrink-0 grow-0 basis-auto",
        className,
      )}
      {...props}
    />
  );
}

function MessageScrollerButton({
  direction = "end",
  className,
  children,
  render,
  variant = "secondary",
  size = "icon-sm",
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Button> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <MessageScrollerPrimitive.Button
      data-slot="message-scroller-button"
      data-direction={direction}
      data-variant={variant}
      data-size={size}
      direction={direction}
      className={cn(
        // Horizontal center is applied by callers (left:50% + margin) to avoid transform fights.
        "absolute z-20 border-border bg-background text-foreground",
        "transition-[opacity,scale] duration-200 hover:bg-muted hover:text-foreground",
        "data-[active=false]:pointer-events-none data-[active=false]:scale-95 data-[active=false]:opacity-0",
        "data-[active=false]:duration-400 data-[active=false]:ease-[cubic-bezier(0.7,0,0.84,0)]",
        "data-[active=true]:scale-100 data-[active=true]:opacity-100 data-[active=true]:ease-[cubic-bezier(0.23,1,0.32,1)]",
        "data-[direction=end]:bottom-4 data-[direction=start]:top-4",
        "data-[direction=start]:[&_svg]:rotate-180",
        className,
      )}
      render={render ?? <Button variant={variant} size={size} />}
      {...props}
    >
      {children ?? (
        <>
          <ArrowDownIcon />
          <span className="sr-only">
            {direction === "end" ? "Scroll to end" : "Scroll to start"}
          </span>
        </>
      )}
    </MessageScrollerPrimitive.Button>
  );
}

export {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
};
