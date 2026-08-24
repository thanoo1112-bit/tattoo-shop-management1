const fs = require('fs');
let code = fs.readFileSync('src/components/artist/booking-requests/ArtistBookingRequestsList.tsx', 'utf8');

const target = `const handleVerifyPaid = async (paymentId: string) => {
    try {
      setIsVerifyingPayment(true);
      setPaymentError(null);
      const requestId = confirmPaidRequest?.request.id;
      
      const { error } = await supabase.rpc('verify_manual_payment', {
        p_payment_id: paymentId,
        p_status: 'paid'
      });

      if (error) throw error;

      setConfirmPaidRequest(null);
      setViewingProofUrl(null);
      
      await fetchRequestsList();`;

const replacement = `const handleVerifyPaid = async (paymentId: string) => {
    console.log('VERIFY_UI_CONFIRM_CLICKED');
    try {
      setIsVerifyingPayment(true);
      setPaymentError(null);
      const requestId = confirmPaidRequest?.request.id;
      
      console.log('VERIFY_RPC_START', {
        status: 'paid',
        hasPaymentId: Boolean(paymentId)
      });
      
      const { data, error } = await supabase.rpc('verify_manual_payment', {
        p_payment_id: paymentId,
        p_status: 'paid'
      });

      console.log('VERIFY_RPC_RESPONSE', {
        hasData: data != null,
        hasError: Boolean(error),
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
        errorDetails: error?.details ?? null,
        errorHint: error?.hint ?? null
      });

      if (error) throw error;

      setConfirmPaidRequest(null);
      setViewingProofUrl(null);
      
      console.log('VERIFY_REFETCH_START');
      await fetchRequestsList();
      console.log('VERIFY_REFETCH_DONE');`;

code = code.replace(target, replacement);

const targetCatch = `    } catch (err: any) {
      console.log('VERIFY_PAID_ERROR', {
        code: err?.code ?? null,
        message: err?.message ?? null,
      });`;

const replacementCatch = `    } catch (err: any) {
      console.log('VERIFY_CATCH', {
        message: err instanceof Error ? err.message : String(err)
      });
      console.log('VERIFY_PAID_ERROR', {
        code: err?.code ?? null,
        message: err?.message ?? null,
      });`;

code = code.replace(targetCatch, replacementCatch);

const targetFinally = `    } finally {
      setIsVerifyingPayment(false);
    }`;

const replacementFinally = `    } finally {
      console.log('VERIFY_FINALLY');
      setIsVerifyingPayment(false);
    }`;

code = code.replace(targetFinally, replacementFinally);

fs.writeFileSync('src/components/artist/booking-requests/ArtistBookingRequestsList.tsx', code);
