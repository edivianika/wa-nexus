import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
import { Button } from './button';
import { Badge } from './badge';
import { CheckCircle, Users, Clock, ArrowRight, ChevronUp, ChevronDown, BarChart, MessagesSquare, Phone, MessageCircle, Monitor } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export function StatCard({ title, value, description, icon, trend }: StatCardProps) {
  return (
    <Card className="dashboard-stat-card overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          {icon && <span className="text-primary">{icon}</span>}
        </div>
      </CardHeader>
      <CardContent className="py-0">
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        {trend && (
          <div className="flex items-center mt-2 text-xs font-medium">
            <span className={trend.isPositive ? "text-green-500" : "text-red-500"}>
              {trend.isPositive ? <ChevronUp className="h-4 w-4 inline mr-1" /> : <ChevronDown className="h-4 w-4 inline mr-1" />}
              {trend.value}%
            </span>
            <span className="text-muted-foreground ml-1">vs last period</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface FeatureCardProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function FeatureCard({ title, description, icon, action }: FeatureCardProps) {
  return (
    <Card className="menu-card border-none shadow-md hover:shadow-lg transition-all duration-200 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-primary text-xl">{icon}</span>}
          <CardTitle className="text-lg font-medium">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <CardDescription className="text-sm">{description}</CardDescription>
      </CardContent>
      {action && (
        <CardFooter className="pt-0">
          <Button className="animated-button w-full" onClick={action.onClick}>
            {action.label}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

interface GlassCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function GlassCard({ title, children, className = '' }: GlassCardProps) {
  return (
    <div className={`glass-panel p-4 ${className}`}>
      <h3 className="text-lg font-medium mb-3">{title}</h3>
      {children}
    </div>
  );
}

export function UIShowcase() {
  return (
    <div className="space-y-10 p-6">
      {/* Header with stats */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Dashboard Stats</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Active Chats" 
            value="24" 
            icon={<MessagesSquare className="h-5 w-5" />}
            trend={{ value: 12, isPositive: true }}
          />
          <StatCard 
            title="Queue Length" 
            value="8" 
            icon={<Clock className="h-5 w-5" />}
            trend={{ value: 5, isPositive: false }}
          />
          <StatCard 
            title="Avg Wait Time" 
            value="2:45" 
            icon={<Clock className="h-5 w-5" />}
          />
          <StatCard 
            title="Resolution Rate" 
            value="92%" 
            icon={<CheckCircle className="h-5 w-5" />}
            trend={{ value: 3, isPositive: true }}
          />
        </div>
      </div>

      {/* Status badges */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Status Badges</h2>
        <div className="flex flex-wrap gap-3">
          <span className="status-badge-active">Active</span>
          <span className="status-badge-waiting">Waiting</span>
          <span className="status-badge-open">Open</span>
          <span className="status-badge-in-progress">In Progress</span>
          <span className="status-badge-high">High</span>
          <span className="status-badge-medium">Medium</span>
          <span className="status-badge-low">Low</span>
        </div>
      </div>
      
      {/* Ticket Statistics */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Ticket Statistics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="border-t-4 border-t-red-500">
            <CardContent className="pt-4">
              <div className="text-sm font-medium text-muted-foreground">Overdue</div>
              <div className="text-2xl font-bold mt-1">22</div>
            </CardContent>
          </Card>
          <Card className="border-t-4 border-t-amber-500">
            <CardContent className="pt-4">
              <div className="text-sm font-medium text-muted-foreground">Due Today</div>
              <div className="text-2xl font-bold mt-1">51</div>
            </CardContent>
          </Card>
          <Card className="border-t-4 border-t-blue-500">
            <CardContent className="pt-4">
              <div className="text-sm font-medium text-muted-foreground">Open Tickets</div>
              <div className="text-2xl font-bold mt-1">1763</div>
            </CardContent>
          </Card>
          <Card className="border-t-4 border-t-purple-500">
            <CardContent className="pt-4">
              <div className="text-sm font-medium text-muted-foreground">On Hold Tickets</div>
              <div className="text-2xl font-bold mt-1">158</div>
            </CardContent>
          </Card>
          <Card className="border-t-4 border-t-green-500">
            <CardContent className="pt-4">
              <div className="text-sm font-medium text-muted-foreground">Closed Tickets</div>
              <div className="text-2xl font-bold mt-1">2378</div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Traffic Sources */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Traffic Sources</h2>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-blue-500 mr-3"></div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Web</div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full mt-1">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: '54.3%' }}></div>
                  </div>
                </div>
                <div className="ml-4 text-sm font-semibold">54.3%</div>
              </div>
              
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-purple-500 mr-3"></div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Forum</div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full mt-1">
                    <div className="bg-purple-500 h-2 rounded-full" style={{ width: '27.8%' }}></div>
                  </div>
                </div>
                <div className="ml-4 text-sm font-semibold">27.8%</div>
              </div>
              
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-amber-500 mr-3"></div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Mobile</div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full mt-1">
                    <div className="bg-amber-500 h-2 rounded-full" style={{ width: '18.9%' }}></div>
                  </div>
                </div>
                <div className="ml-4 text-sm font-semibold">18.9%</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Buttons */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Buttons</h2>
        <div className="flex flex-wrap gap-4">
          <Button>Default Button</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button className="animated-button">
            Animated Button
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
} 