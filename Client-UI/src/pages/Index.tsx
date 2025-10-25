
import { useEffect } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { MessageSquareText, Zap, Shield, Code } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Force scroll to top on page load
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      
      {/* Hero Section */}
      <section className="hero-gradient py-20 text-white">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 items-center">
            <div className="space-y-4">
              <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                Powerful WhatsApp API for Developers
              </h1>
              <p className="text-muted-100 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Connect your applications to WhatsApp messaging with our simple, reliable API. Send and receive messages, media, and more.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button 
                  onClick={() => navigate("/register")} 
                  size="lg" 
                  className="bg-white text-wa-tealGreen hover:bg-gray-100"
                >
                  Get Started
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  onClick={() => navigate("/login")}
                  className="border-white text-white hover:bg-white hover:text-wa-tealGreen"
                >
                  Log In
                </Button>
              </div>
            </div>
            <div className="mx-auto lg:mx-0 w-full max-w-[500px]">
              <div className="glass-panel p-6">
                <div className="rounded-lg bg-background p-4 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="h-3 w-3 rounded-full bg-rose-500"></div>
                    <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                    <div className="h-3 w-3 rounded-full bg-green-500"></div>
                  </div>
                  <div className="mt-4 space-y-2 font-mono text-sm">
                    <div className="text-left">
                      <span className="text-wa-green">const</span>{" "}
                      <span className="text-primary">wa</span> = 
                      <span className="text-muted-foreground"> require</span>
                      (<span className="text-orange-400">'wa-nexus'</span>);
                    </div>
                    <div className="text-left">
                      <span className="text-wa-green">const</span>{" "}
                      <span className="text-primary">client</span> = 
                      <span className="text-primary"> wa</span>
                      .<span className="text-muted-foreground">connect</span>
                      (<span className="text-orange-400">'api-key'</span>);
                    </div>
                    <div className="text-left">
                      <span className="text-wa-green">await</span>{" "}
                      <span className="text-primary">client</span>
                      .<span className="text-muted-foreground">sendMessage</span>({"{"}
                    </div>
                    <div className="text-left ml-4">
                      <span className="text-primary">to</span>:{" "}
                      <span className="text-orange-400">'+1234567890'</span>,
                    </div>
                    <div className="text-left ml-4">
                      <span className="text-primary">message</span>:{" "}
                      <span className="text-orange-400">'Hello from API!'</span>
                    </div>
                    <div className="text-left">{"});"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section id="features" className="py-16 md:py-24">
        <div className="container px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Key Features
            </h2>
            <p className="mt-4 text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed max-w-2xl mx-auto">
              Everything you need to integrate WhatsApp messaging into your applications
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card icon={<MessageSquareText />} title="Messaging" description="Send and receive text messages, media, and documents." />
            <Card icon={<Zap />} title="Webhooks" description="Real-time notifications for incoming messages and status updates." />
            <Card icon={<Shield />} title="Security" description="End-to-end encryption and secure API connections." />
            <Card icon={<Code />} title="Simple API" description="Easy to integrate with any programming language or framework." />
          </div>
        </div>
      </section>
      
      {/* Pricing */}
      <section id="pricing" className="py-16 md:py-24 bg-muted/50">
        <div className="container px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Pricing Plans
            </h2>
            <p className="mt-4 text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed max-w-2xl mx-auto">
              Choose the plan that fits your needs
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <PricingCard 
              title="Basic" 
              price="$29" 
              description="Perfect for small businesses and startups" 
              features={[
                "1 Device Connection",
                "1,000 Messages/month",
                "Basic API Access",
                "Community Support"
              ]}
            />
            <PricingCard 
              title="Professional" 
              price="$79" 
              description="Ideal for growing businesses" 
              features={[
                "5 Device Connections",
                "10,000 Messages/month",
                "Full API Access",
                "Priority Support"
              ]}
              highlighted={true}
            />
            <PricingCard 
              title="Enterprise" 
              price="$199" 
              description="For large scale operations" 
              features={[
                "Unlimited Device Connections",
                "100,000 Messages/month",
                "Advanced API Features",
                "24/7 Dedicated Support"
              ]}
            />
          </div>
        </div>
      </section>
      
      {/* About Section */}
      <section id="about" className="py-16 md:py-24">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl mb-6">
                About WA Nexus
              </h2>
              <p className="text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed mb-4">
                WA Nexus provides a reliable and scalable WhatsApp API solution for businesses and developers worldwide. Our platform enables seamless communication through WhatsApp channels, helping businesses connect with their customers more effectively.
              </p>
              <p className="text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Built by developers for developers, our API is designed to be simple to integrate yet powerful enough to handle enterprise-level messaging needs.
              </p>
            </div>
            <div className="space-y-4 lg:space-y-6">
              <div className="glass-panel p-6">
                <h3 className="text-xl font-bold mb-2">Our Mission</h3>
                <p>To simplify WhatsApp integration for businesses of all sizes, enabling better customer engagement through messaging.</p>
              </div>
              <div className="glass-panel p-6">
                <h3 className="text-xl font-bold mb-2">Support</h3>
                <p>We offer comprehensive documentation and dedicated support to ensure your success with our platform.</p>
              </div>
              <div className="glass-panel p-6">
                <h3 className="text-xl font-bold mb-2">Security</h3>
                <p>Security is our top priority. All communications through our API are encrypted and secure.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="hero-gradient py-16 text-white">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-4 text-center">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Ready to get started?
            </h2>
            <p className="max-w-[700px] text-lg md:text-xl">
              Create your account now and start integrating WhatsApp messaging into your applications within minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button 
                onClick={() => navigate("/register")} 
                size="lg" 
                className="bg-white text-wa-tealGreen hover:bg-gray-100"
              >
                Create Account
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                onClick={() => navigate("/dashboard/documentation")}
                className="border-white text-white hover:bg-white hover:text-wa-tealGreen"
              >
                View Documentation
              </Button>
            </div>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="border-t py-6 md:py-8">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 md:gap-8">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-wa-green">WA Nexus</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <a href="#" className="hover:underline">Terms</a>
              <a href="#" className="hover:underline">Privacy</a>
              <a href="#" className="hover:underline">Contact</a>
            </div>
            <div className="text-sm text-muted-foreground">
              © 2025 WA Nexus. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

// Feature Card Component
function Card({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center p-6 space-y-4 text-center bg-background rounded-xl border">
      <div className="p-3 bg-primary/10 rounded-full text-primary">
        {icon}
      </div>
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

// Pricing Card Component
function PricingCard({ 
  title, 
  price, 
  description,
  features,
  highlighted = false
}: { 
  title: string;
  price: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <div className={`flex flex-col p-6 space-y-6 rounded-xl border ${highlighted ? 'border-primary shadow-lg relative overflow-hidden' : ''}`}>
      {highlighted && (
        <div className="absolute top-0 right-0">
          <div className="bg-primary text-primary-foreground px-3 py-1 text-xs font-medium transform rotate-45 translate-x-2 -translate-y-1">
            Popular
          </div>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="text-2xl font-bold">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-baseline">
        <span className="text-4xl font-bold">{price}</span>
        <span className="text-muted-foreground ml-1">/month</span>
      </div>
      <ul className="space-y-2">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center text-muted-foreground">
            <svg 
              className="w-4 h-4 mr-2 text-primary" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
            {feature}
          </li>
        ))}
      </ul>
      <Button 
        variant={highlighted ? "default" : "outline"} 
        className={`w-full mt-6 ${highlighted ? "" : ""}`}
      >
        Choose Plan
      </Button>
    </div>
  );
}

export default Index;
