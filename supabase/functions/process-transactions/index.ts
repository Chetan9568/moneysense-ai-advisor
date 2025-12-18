import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to retry OpenAI calls with exponential backoff
async function callOpenAIWithRetry(openAIApiKey: string, body: object, maxRetries = 3): Promise<any> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return await response.json();
    }

    if (response.status === 429) {
      // Rate limited - wait and retry
      const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      console.log(`Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    // For other errors, throw immediately
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }
  
  // If all retries failed, return null to trigger fallback
  console.log('All OpenAI retries failed, using fallback processing');
  return null;
}

// Fallback column detection without AI
function detectColumnsManually(headers: string[]): any {
  const headerLower = headers.map(h => h.toLowerCase());
  
  let dateColumn = headers.find((_, i) => 
    ['date', 'transaction_date', 'trans_date', 'posted_date', 'tdate'].includes(headerLower[i])
  );
  
  let descriptionColumn = headers.find((_, i) => 
    ['description', 'desc', 'name', 'merchant', 'transaction', 'details', 'memo'].includes(headerLower[i])
  );
  
  let amountColumn = headers.find((_, i) => 
    ['amount', 'amt', 'value', 'sum', 'debit', 'credit'].includes(headerLower[i])
  );

  let accountColumn = headers.find((_, i) => 
    ['account', 'acct', 'account_name'].includes(headerLower[i])
  );

  // If not found by exact match, try partial match
  if (!dateColumn) {
    dateColumn = headers.find((_, i) => headerLower[i].includes('date')) || headers[0];
  }
  if (!descriptionColumn) {
    descriptionColumn = headers.find((_, i) => 
      headerLower[i].includes('name') || headerLower[i].includes('desc')
    ) || headers[1];
  }
  if (!amountColumn) {
    amountColumn = headers.find((_, i) => 
      headerLower[i].includes('amount') || headerLower[i].includes('balance')
    ) || headers[2];
  }

  return {
    column_mapping: {
      date_column: dateColumn,
      description_column: descriptionColumn,
      amount_column: amountColumn,
      account_column: accountColumn || null
    }
  };
}

// Categorize transaction based on description
function categorizeTransaction(description: string): string {
  const desc = description.toLowerCase();
  
  if (desc.includes('salary') || desc.includes('payroll') || desc.includes('direct deposit') || desc.includes('income')) {
    return 'Income';
  }
  if (desc.includes('grocery') || desc.includes('food') || desc.includes('restaurant') || 
      desc.includes('cafe') || desc.includes('coffee') || desc.includes('pizza') ||
      desc.includes('swiggy') || desc.includes('zomato') || desc.includes('uber eats')) {
    return 'Food & Dining';
  }
  if (desc.includes('gas') || desc.includes('fuel') || desc.includes('petrol') || 
      desc.includes('uber') || desc.includes('ola') || desc.includes('lyft') ||
      desc.includes('transport') || desc.includes('metro') || desc.includes('bus')) {
    return 'Transportation';
  }
  if (desc.includes('shop') || desc.includes('store') || desc.includes('amazon') ||
      desc.includes('flipkart') || desc.includes('walmart') || desc.includes('target') ||
      desc.includes('mall') || desc.includes('retail')) {
    return 'Shopping';
  }
  if (desc.includes('bill') || desc.includes('utility') || desc.includes('electric') ||
      desc.includes('water') || desc.includes('internet') || desc.includes('phone') ||
      desc.includes('mobile') || desc.includes('recharge')) {
    return 'Bills & Utilities';
  }
  if (desc.includes('health') || desc.includes('medical') || desc.includes('pharmacy') ||
      desc.includes('hospital') || desc.includes('doctor') || desc.includes('clinic')) {
    return 'Healthcare';
  }
  if (desc.includes('rent') || desc.includes('mortgage') || desc.includes('lease')) {
    return 'Housing';
  }
  if (desc.includes('movie') || desc.includes('netflix') || desc.includes('spotify') ||
      desc.includes('entertainment') || desc.includes('game') || desc.includes('subscription')) {
    return 'Entertainment';
  }
  if (desc.includes('transfer') || desc.includes('upi') || desc.includes('neft') ||
      desc.includes('imps') || desc.includes('payment')) {
    return 'Transfer';
  }
  if (desc.includes('atm') || desc.includes('withdrawal') || desc.includes('cash')) {
    return 'Cash Withdrawal';
  }
  
  return 'Other';
}

// Detect if transaction is income or expense
function detectTransactionType(description: string, amount: string, drcrColumn?: string): string {
  const desc = description.toLowerCase();
  
  // Check DR/CR column if available
  if (drcrColumn) {
    const drcr = drcrColumn.toLowerCase().trim();
    if (drcr === 'cr' || drcr === 'credit' || drcr === 'c') return 'income';
    if (drcr === 'dr' || drcr === 'debit' || drcr === 'd') return 'expense';
  }
  
  // Check for income indicators
  if (desc.includes('salary') || desc.includes('deposit') || desc.includes('credit') ||
      desc.includes('refund') || desc.includes('cashback') || desc.includes('received') ||
      desc.includes('income') || desc.includes('bonus') || desc.includes('interest earned')) {
    return 'income';
  }
  
  // Check amount sign
  if (amount.includes('+')) return 'income';
  if (amount.includes('-')) return 'expense';
  
  return 'expense';
}

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
    const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase().replace(/['"]/g, ''));
    
    console.log(`CSV headers detected: ${headers.join(', ')}`);

    // Try AI-based column detection with fallback
    let processingConfig: any;
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

    if (openAIApiKey) {
      const sampleRows = lines.slice(1, Math.min(6, lines.length)).join('\n');
      
      const aiResult = await callOpenAIWithRetry(openAIApiKey, {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a financial data processing AI. Analyze CSV transaction data and:
            1. Map column headers to standard fields (date, description, amount, category, account)
            2. Detect transaction types (income/expense)
            
            Return ONLY a JSON object with this structure:
            {
              "column_mapping": {
                "date_column": "column_name",
                "description_column": "column_name", 
                "amount_column": "column_name",
                "account_column": "column_name_or_null",
                "drcr_column": "column_name_or_null"
              }
            }`
          },
          {
            role: 'user',
            content: `Analyze this CSV transaction data:
            
            Headers: ${headers.join(', ')}
            
            Sample rows:
            ${sampleRows}
            
            Map the columns appropriately.`
          }
        ],
        temperature: 0.2,
        max_tokens: 500,
      });

      if (aiResult && aiResult.choices?.[0]?.message?.content) {
        try {
          processingConfig = JSON.parse(aiResult.choices[0].message.content);
          console.log('Using AI-based column detection');
        } catch (parseError) {
          console.log('Failed to parse AI response, using fallback');
          processingConfig = detectColumnsManually(headers);
        }
      } else {
        console.log('AI unavailable, using fallback column detection');
        processingConfig = detectColumnsManually(headers);
      }
    } else {
      console.log('No OpenAI key, using fallback column detection');
      processingConfig = detectColumnsManually(headers);
    }

    console.log('Processing configuration:', JSON.stringify(processingConfig));

    // Process transactions
    const transactions: any[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',').map((v: string) => v.trim().replace(/['"]/g, ''));
        
        if (values.length < 2) continue; // Skip empty/incomplete rows

        const rowData: any = {};
        headers.forEach((header: string, index: number) => {
          rowData[header] = values[index] || '';
        });

        // Extract fields using mapping
        const dateField = rowData[processingConfig.column_mapping.date_column] || '';
        const descriptionField = rowData[processingConfig.column_mapping.description_column] || '';
        const amountField = rowData[processingConfig.column_mapping.amount_column] || '';
        const accountField = rowData[processingConfig.column_mapping.account_column] || 'Primary Account';
        const drcrField = rowData[processingConfig.column_mapping.drcr_column];

        // Skip if essential fields are missing
        if (!dateField || !amountField) continue;

        // Parse date
        let transactionDate: string;
        try {
          const parsedDate = new Date(dateField);
          if (isNaN(parsedDate.getTime())) {
            // Try different date formats
            const parts = dateField.split(/[\/\-\.]/);
            if (parts.length === 3) {
              // Assume DD/MM/YYYY or MM/DD/YYYY
              const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
              transactionDate = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            } else {
              transactionDate = new Date().toISOString().split('T')[0];
            }
          } else {
            transactionDate = parsedDate.toISOString().split('T')[0];
          }
        } catch {
          transactionDate = new Date().toISOString().split('T')[0];
        }

        // Parse amount
        const cleanAmount = amountField.replace(/[$,₹€£\s]/g, '');
        const amount = Math.abs(parseFloat(cleanAmount));
        if (isNaN(amount) || amount === 0) continue;

        // Determine transaction type
        const transactionType = detectTransactionType(descriptionField, amountField, drcrField);
        
        // Categorize
        const category = categorizeTransaction(descriptionField);

        transactions.push({
          user_id: user.id,
          date: transactionDate,
          description: descriptionField || 'Transaction',
          category: category,
          amount: amount,
          account: accountField,
          transaction_type: transactionType
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
      errors: errors.slice(0, 10),
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
