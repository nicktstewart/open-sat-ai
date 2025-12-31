"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface QueryInputProps {
  onSubmit: (query: string) => void;
  isLoading: boolean;
}

export default function QueryInput({ onSubmit, isLoading }: QueryInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !isLoading) {
      onSubmit(value.trim());
    }
  };

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask about satellite data... (e.g., 'Show vegetation changes in Tokyo over the past year')"
            className="min-h-[100px] resize-none"
            disabled={isLoading}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={isLoading || !value.trim()}>
            {isLoading ? "Processing..." : "Analyze"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
