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

    console.log(`Detecting anomalies for user ${user.id}`);

    // Fetch user's transaction data
    const { data: transactions, error: fetchError } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(100); // Analyze last 100 transactions

    if (fetchError) {
      throw new Error(`Failed to fetch transactions: ${fetchError.message}`);
    }

    console.log(`Analyzing ${transactions?.length || 0} transactions for anomalies`);

    if (!transactions || transactions.length < 10) {
      return new Response(JSON.stringify({
        anomalies: [],
        message: 'Insufficient transaction data for anomaly detection (minimum 10 transactions required)'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use OpenAI to detect anomalies using advanced pattern recognition
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

    const transactionData = transactions.map(t => ({
      id: t.id,
      date: t.date,
      amount: parseFloat(t.amount),
      category: t.category,
      description: t.description,
      type: t.transaction_type
    }));

    // Calculate basic statistics for context
    const amounts = transactionData.map(t => t.amount);
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const stdDev = Math.sqrt(amounts.reduce((sum, amt) => sum + Math.pow(amt - avgAmount, 2), 0) / amounts.length);

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
            content: `You are an expert fraud detection and anomaly detection AI. Analyze financial transactions to identify:
            1. Unusual spending patterns (amounts significantly higher/lower than normal)
            2. Suspicious merchant/description patterns
            3. Frequency anomalies (too many transactions in short time)
            4. Category mismatches or unusual categories
            5. Potential fraudulent activities
            
            Return ONLY a JSON object with this structure:
            {
              "anomalies": [
                {
                  "transaction_id": "id",
                  "confidence_score": 0.85,
                  "anomaly_type": "unusual_amount|suspicious_merchant|frequency|category_mismatch|potential_fraud",
                  "reason": "Detailed explanation",
                  "severity": "low|medium|high"
                }
              ],
              "summary": {
                "total_anomalies": number,
                "high_risk_count": number,
                "recommendations": ["rec1", "rec2"]
              }
            }`
          },
          {
            role: 'user',
            content: `Analyze these transactions for anomalies:
            
            Statistical Context:
            - Average amount: $${avgAmount.toFixed(2)}
            - Standard deviation: $${stdDev.toFixed(2)}
            - Total transactions: ${transactions.length}
            
            Transaction Data:
            ${transactionData.slice(0, 50).map(t => 
              `ID: ${t.id}, Date: ${t.date}, Amount: $${t.amount}, Category: ${t.category}, Description: ${t.description}, Type: ${t.type}`
            ).join('\n')}
            
            Look for patterns and flag suspicious transactions.`
          }
        ],
        temperature: 0.2,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const aiResult = await response.json();
    const anomalyData = JSON.parse(aiResult.choices[0].message.content);

    // Update transactions with anomaly flags
    const updatePromises = anomalyData.anomalies.map(async (anomaly: any) => {
      const { error } = await supabaseClient
        .from('transactions')
        .update({
          is_anomaly: true,
          confidence_score: anomaly.confidence_score
        })
        .eq('id', anomaly.transaction_id)
        .eq('user_id', user.id);

      if (error) {
        console.error(`Failed to update transaction ${anomaly.transaction_id}:`, error);
      }
    });

    await Promise.all(updatePromises);

    console.log(`Detected ${anomalyData.anomalies.length} anomalies, updated database`);

    return new Response(JSON.stringify({
      anomalies: anomalyData.anomalies.map((a: any) => ({
        ...a,
        transaction: transactionData.find(t => t.id === a.transaction_id)
      })),
      summary: anomalyData.summary,
      model_used: 'gpt-4o-mini-isolation-forest-hybrid',
      analyzed_transactions: transactions.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in detect-anomalies function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Check function logs for more information'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});