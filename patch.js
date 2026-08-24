const fs = require('fs');
let code = fs.readFileSync('src/components/artist/booking-requests/ArtistBookingRequestsList.tsx', 'utf8');

const target = `const { error } = await supabase.rpc('verify_manual_payment', {
          p_payment_id: paymentId,
          p_status: 'paid'
        });

        if (error) throw error;`;

const replacement = `const { data, error } = await supabase.rpc('verify_manual_payment', {
          p_payment_id: paymentId,
          p_status: 'paid'
        });

        console.log('VERIFY_PAYMENT_RPC_RESULT', {
          hasData: data != null,
          errorCode: error?.code ?? null,
          errorMessage: error?.message ?? null,
          errorDetails: error?.details ?? null,
          errorHint: error?.hint ?? null,
        });

        if (error) throw error;`;

code = code.replace(target, replacement);

fs.writeFileSync('src/components/artist/booking-requests/ArtistBookingRequestsList.tsx', code);
