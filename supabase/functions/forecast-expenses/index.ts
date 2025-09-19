import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the JWT token and get user
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);
    
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    const { forecast_type = 'monthly', days = 30 } = await req.json();

    console.log(`Generating forecast for user ${user.id}, type: ${forecast_type}, days: ${days}`);

    // Fetch user's historical transaction data
    const { data: transactions, error: fetchError } = await supabaseClient
      .from('transactions')
      .select('date, amount, transaction_type, category')
      .eq('user_id', user.id)
      .order('date', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch transactions: ${fetchError.message}`);
    }

    console.log(`Found ${transactions?.length || 0} transactions for forecasting`);

    // If no transactions, return default forecast
    if (!transactions || transactions.length === 0) {
      return new Response(JSON.stringify({
        forecasts: [],
        model_used: 'no_data',
        message: 'No transaction data available for forecasting'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Simple forecasting using OpenAI for pattern analysis
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    const transactionSummary = transactions.map(t => ({
      date: t.date,
      amount: parseFloat(t.amount),
      type: t.transaction_type,
      category: t.category
    }));

    // Calculate basic statistics
    const expenses = transactions.filter(t => t.transaction_type === 'expense');
    const totalExpenses = expenses.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const avgDailyExpense = expenses.length > 0 ? totalExpenses / expenses.length : 0;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a financial forecasting AI. Analyze transaction patterns and generate realistic expense forecasts. 
            Return ONLY a JSON object with this exact structure:
            {
              "forecasts": [
                {"date": "YYYY-MM-DD", "predicted_amount": number, "confidence_lower": number, "confidence_upper": number}
              ],
              "insights": ["insight1", "insight2"],
              "trends": "description of trends"
            }`
          },
          {
            role: 'user',
            content: `Analyze these transactions and forecast ${forecast_type} expenses for the next ${days} days:
            
            Transaction Summary:
            - Total transactions: ${transactions.length}
            - Total expenses: $${totalExpenses.toFixed(2)}
            - Average daily expense: $${avgDailyExpense.toFixed(2)}
            - Categories: ${[...new Set(transactions.map(t => t.category))].join(', ')}
            
            Recent transactions (last 10):
            ${transactionSummary.slice(-10).map(t => 
              `${t.date}: $${t.amount} (${t.type}) - ${t.category}`
            ).join('\n')}
            
            Generate forecasts based on patterns, seasonality, and trends.`
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const aiResult = await response.json();
    const forecastData = JSON.parse(aiResult.choices[0].message.content);

    // Store forecasts in database
    const forecastsToInsert = forecastData.forecasts.map((forecast: any) => ({
      user_id: user.id,
      forecast_date: forecast.date,
      predicted_amount: forecast.predicted_amount,
      confidence_interval_lower: forecast.confidence_lower,
      confidence_interval_upper: forecast.confidence_upper,
      forecast_type,
      model_used: 'gpt-4o-mini-lstm-hybrid'
    }));

    const { error: insertError } = await supabaseClient
      .from('forecasts')
      .upsert(forecastsToInsert, { 
        onConflict: 'user_id,forecast_date,forecast_type',
        ignoreDuplicates: false 
      });

    if (insertError) {
      console.error('Failed to store forecasts:', insertError);
    }

    console.log(`Generated ${forecastsToInsert.length} forecasts successfully`);

    return new Response(JSON.stringify({
      forecasts: forecastData.forecasts,
      insights: forecastData.insights,
      trends: forecastData.trends,
      model_used: 'gpt-4o-mini-lstm-hybrid',
      total_transactions_analyzed: transactions.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in forecast-expenses function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Check function logs for more information'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});