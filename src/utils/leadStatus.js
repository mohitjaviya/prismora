// A lead is converted once the customer has committed and an order is raised.
// The convert step (convertLeadToOrder) moves it to 'First Order' by default,
// or 'Active' — 'Converted' is only one of three. Counting that one alone read
// every real conversion as zero, so everything that asks "is this converted?"
// asks here.
export const CONVERSION_STATUSES = ['Converted', 'First Order', 'Active'];

export const isConvertedStatus = (status) => CONVERSION_STATUSES.includes(status);

export const isConvertedLead = (lead) => isConvertedStatus(lead?.status);

// Still being worked: neither converted nor lost. What the pipeline value sums.
export const isOpenLead = (lead) => !isConvertedLead(lead) && lead?.status !== 'Lost';

/** Converted leads over all leads, as a percentage (0–100, unrounded). */
export const conversionRate = (leads) => {
  const list = leads || [];
  if (list.length === 0) return 0;
  return (list.filter(isConvertedLead).length / list.length) * 100;
};
