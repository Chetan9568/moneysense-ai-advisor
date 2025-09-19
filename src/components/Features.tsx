import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Shield, Brain, BarChart3, AlertTriangle, Target, Upload, Zap } from "lucide-react";

const Features = () => {
  const features = [
    {
      icon: <Upload className="h-8 w-8" />,
      title: "Smart Data Ingestion",
      description: "Upload CSV/Excel files with automatic duplicate removal, missing value handling, and intelligent transaction categorization using NLP.",
      color: "text-primary"
    },
    {
      icon: <TrendingUp className="h-8 w-8" />,
      title: "Expense Forecasting",
      description: "Advanced LSTM and Prophet models provide accurate daily, weekly, and monthly expense predictions with confidence intervals.",
      color: "text-success"
    },
    {
      icon: <Shield className="h-8 w-8" />,
      title: "Fraud Detection",
      description: "Isolation Forest and Autoencoder models detect unusual transactions with real-time alerts for suspicious activity.",
      color: "text-warning"
    },
    {
      icon: <Target className="h-8 w-8" />,
      title: "Smart Recommendations",
      description: "Personalized savings goals and budget recommendations based on your income, expenses, and lifestyle patterns.",
      color: "text-accent"
    },
    {
      icon: <Brain className="h-8 w-8" />,
      title: "Explainable AI",
      description: "SHAP and LIME integration provides clear explanations for every prediction and recommendation with feature importance.",
      color: "text-primary"
    },
    {
      icon: <BarChart3 className="h-8 w-8" />,
      title: "Interactive Visualizations",
      description: "Beautiful charts and graphs show spending trends, forecasts, and insights with real-time data updates.",
      color: "text-success"
    },
    {
      icon: <Zap className="h-8 w-8" />,
      title: "Real-Time Processing",
      description: "Microservice architecture ensures fast processing with independent forecasting, detection, and analysis modules.",
      color: "text-warning"
    },
    {
      icon: <AlertTriangle className="h-8 w-8" />,
      title: "Anomaly Alerts",
      description: "Instant notifications for unusual spending patterns and potential fraudulent activities across all your accounts.",
      color: "text-destructive"
    }
  ];

  return (
    <section id="features" className="py-20 bg-background">
      <div className="container px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Powerful <span className="bg-gradient-primary bg-clip-text text-transparent">AI Features</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Advanced machine learning capabilities designed to transform your financial management experience
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className="bg-gradient-card border-0 shadow-card hover:shadow-elevated transition-all duration-300 group cursor-pointer"
            >
              <CardHeader className="text-center">
                <div className={`inline-flex p-3 rounded-full bg-background/50 mx-auto mb-4 ${feature.color} group-hover:scale-110 transition-transform duration-300`}>
                  {feature.icon}
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Technical Architecture Overview */}
        <div className="mt-20">
          <div className="text-center mb-12">
            <h3 className="text-2xl md:text-3xl font-bold mb-4">
              Built with <span className="bg-gradient-primary bg-clip-text text-transparent">Enterprise Architecture</span>
            </h3>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Scalable, secure, and performant technology stack designed for the future
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <Brain className="h-8 w-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold mb-2">Machine Learning</h4>
              <p className="text-muted-foreground">
                LSTM, Prophet, Isolation Forest, and Autoencoder models for comprehensive financial analysis
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold mb-2">Security First</h4>
              <p className="text-muted-foreground">
                HTTPS encryption, secure APIs, and enterprise-grade data protection for your financial information
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold mb-2">Microservices</h4>
              <p className="text-muted-foreground">
                Scalable architecture with independent modules for forecasting, detection, and recommendations
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;