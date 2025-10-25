import React from 'react';
import { UIShowcase } from '../components/ui/card-showcase';

export default function UIDemo() {
  return (
    <div className="container mx-auto py-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">UI Theme Preview</h1>
          <p className="text-muted-foreground">
            This page demonstrates the new UI components and theme inspired by the Menu Stock Oracle design.
          </p>
        </div>
        
        <div className="rounded-lg overflow-hidden border border-border">
          <UIShowcase />
        </div>
      </div>
    </div>
  );
} 