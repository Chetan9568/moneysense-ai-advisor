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

    const { csv_data, filename } = await req.json();

    console.log(`Processing transactions for user ${user.id}, filename: ${filename}`);

    // Create file upload record
    const { data: fileUpload, error: fileError } = await supabaseClient
      .from('file_uploads')
      .insert({
        user_id: user.id,
        filename: filename || 'uploaded_transactions.csv',
        status: 'processing',
        file_type: 'csv'
      })
      .select()
      .single();

    if (fileError) {
      throw new Error(`Failed to create file upload record: ${fileError.message}`);
    }

    // Parse CSV data
    const lines = csv_data.trim().split('\n');
    const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
    
    console.log(`CSV headers detected: ${headers.join(', ')}`);

    // Use OpenAI to intelligently categorize and clean the transaction data
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

    const sampleRows = lines.slice(1, Math.min(6, lines.length)).join('\n');

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
            content: `You are a financial data processing AI. Analyze CSV transaction data and:
            1. Map column headers to standard fields (date, description, amount, category, account)
            2. Categorize transactions into appropriate categories
            3. Detect transaction types (income/expense)
            4. Clean and standardize the data
            
            Return ONLY a JSON object with this structure:
            {
              "column_mapping": {
                "date_column": "column_name",
                "description_column": "column_name", 
                "amount_column": "column_name",
                "account_column": "column_name_or_null"
              },
              "category_mapping": {
                "description_pattern": "category_name"
              },
              "processing_instructions": {
                "date_format": "MM/DD/YYYY or YYYY-MM-DD etc",
                "amount_format": "positive_negative or always_positive",
                "notes": "any special processing notes"
              }
            }`
          },
          {
            role: 'user',
            content: `Analyze this CSV transaction data:
            
            Headers: ${headers.join(', ')}
            
            Sample rows:
            ${sampleRows}
            
            Map the columns and suggest categorization patterns.`
          }
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const aiResult = await response.json();
    const processingConfig = JSON.parse(aiResult.choices[0].message.content);

    console.log('Processing configuration:', processingConfig);

    // Process transactions based on AI analysis
    const transactions = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',').map((v: string) => v.trim().replace(/['"]/g, ''));
        
        if (values.length < headers.length) continue; // Skip incomplete rows

        const rowData: any = {};
        headers.forEach((header, index) => {
          rowData[header] = values[index];
        });

        // Extract fields using AI mapping
        const dateField = rowData[processingConfig.column_mapping.date_column];
        const descriptionField = rowData[processingConfig.column_mapping.description_column];
        const amountField = rowData[processingConfig.column_mapping.amount_column];
        const accountField = rowData[processingConfig.column_mapping.account_column] || 'Primary Account';

        // Parse date
        let transactionDate;
        try {
          transactionDate = new Date(dateField).toISOString().split('T')[0];
        } catch {
          transactionDate = new Date().toISOString().split('T')[0];
        }

        // Parse amount
        const amount = Math.abs(parseFloat(amountField.replace(/[$,]/g, '')));
        if (isNaN(amount)) continue;

        // Determine transaction type and categorize
        const isIncome = amountField.includes('+') || 
                        descriptionField.toLowerCase().includes('deposit') ||
                        descriptionField.toLowerCase().includes('salary') ||
                        descriptionField.toLowerCase().includes('income');

        // Simple categorization (can be enhanced with AI)
        let category = 'Other';
        const desc = descriptionField.toLowerCase();
        if (desc.includes('grocery') || desc.includes('food') || desc.includes('restaurant')) {
          category = 'Food & Dining';
        } else if (desc.includes('gas') || desc.includes('fuel') || desc.includes('transport')) {
          category = 'Transportation';
        } else if (desc.includes('shop') || desc.includes('store') || desc.includes('amazon')) {
          category = 'Shopping';
        } else if (desc.includes('bill') || desc.includes('utility') || desc.includes('electric')) {
          category = 'Bills & Utilities';
        } else if (desc.includes('health') || desc.includes('medical') || desc.includes('pharmacy')) {
          category = 'Healthcare';
        } else if (isIncome) {
          category = 'Income';
        }

        transactions.push({
          user_id: user.id,
          date: transactionDate,
          description: descriptionField,
          category: category,
          amount: amount,
          account: accountField,
          transaction_type: isIncome ? 'income' : 'expense'
        });

      } catch (error) {
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    console.log(`Processed ${transactions.length} transactions with ${errors.length} errors`);

    // Remove duplicates based on date, amount, and description
    const uniqueTransactions = transactions.filter((transaction, index, self) =>
      index === self.findIndex(t => 
        t.date === transaction.date &&
        t.amount === transaction.amount &&
        t.description === transaction.description
      )
    );

    console.log(`After deduplication: ${uniqueTransactions.length} unique transactions`);

    // Insert transactions into database
    let insertedCount = 0;
    if (uniqueTransactions.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('transactions')
        .insert(uniqueTransactions);

      if (insertError) {
        throw new Error(`Failed to insert transactions: ${insertError.message}`);
      }
      insertedCount = uniqueTransactions.length;
    }

    // Update file upload status
    await supabaseClient
      .from('file_uploads')
      .update({
        status: 'completed',
        processed_transactions: insertedCount,
        error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null
      })
      .eq('id', fileUpload.id);

    console.log(`Successfully processed ${insertedCount} transactions`);

    return new Response(JSON.stringify({
      success: true,
      processed_transactions: insertedCount,
      total_rows: lines.length - 1,
      errors: errors.slice(0, 10), // Return first 10 errors
      duplicate_count: transactions.length - uniqueTransactions.length,
      file_upload_id: fileUpload.id,
      categories_detected: [...new Set(uniqueTransactions.map(t => t.category))]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in process-transactions function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Check function logs for more information'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});