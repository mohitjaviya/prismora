/**
 * PRISMORA Communications Utility
 * Handles client-side, zero-dependency WhatsApp alerts & Email triggers
 */

/**
 * Generates and opens a WhatsApp Click-to-Chat link
 * @param {string} phone - Receiver's phone number with country code (e.g., '919876543210')
 * @param {string} text - Message template text
 */
export const sendWhatsAppAlert = (phone, text) => {
  if (!phone) {
    alert('No phone number available for this contact.');
    return;
  }
  // Sanitize phone (remove spaces, dashes, plus sign)
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  
  // If Indian number and doesn't start with country code '91', prepend it
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }
  
  const encodedText = encodeURIComponent(text);
  const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  window.open(url, '_blank');
};

/**
 * Triggers a native email client compose window
 * @param {string} to - Receiver's email
 * @param {string} subject - Email subject line
 * @param {string} body - Email body content
 */
export const sendEmailAlert = (to, subject, body) => {
  if (!to) {
    alert('No email address available for this contact.');
    return;
  }
  const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(mailtoUrl, '_blank');
};

/**
 * Message Templates for different alert types
 */
export const templates = {
  paymentReminder: (customerName, invoiceId, amount, daysOverdue) => 
    `Hi ${customerName},\n\nThis is a payment reminder from Prismora. Invoice ${invoiceId} for ₹${amount.toLocaleString('en-IN')} is currently overdue by ${daysOverdue} days. Please arrange for payment at your earliest convenience.\n\nThank you,\nPrismora Finance Team`,
  
  lowStockAlert: (productName, qty, warehouse) =>
    `ATTENTION WAREHOUSE MANAGER:\n\nProduct: ${productName}\nCurrent Stock: ${qty} units\nWarehouse: ${warehouse}\n\nThis product has fallen below the safety reorder threshold. Please prepare a Purchase Order to restock.`,
  
  expiryAlert: (productName, batchNumber, daysLeft, qty, warehouse) =>
    `ATTENTION:\n\nProduct: ${productName}\nBatch: ${batchNumber || 'N/A'}\nStock: ${qty} units\nWarehouse: ${warehouse}\n\nThis batch is set to expire in ${daysLeft} days. Please schedule clearance or promotional schemes.`,

  complaintRegistered: (customerName, complaintId, type) =>
    `Dear ${customerName},\n\nYour complaint has been successfully registered under Ticket ID: ${complaintId} (Type: ${type}). Our team is reviewing the issue and will contact you within 24 hours.\n\nRegards,\nPrismora Support Team`,
    
  leadAssigned: (repName, leadName, company) =>
    `Hello ${repName},\n\nYou have been assigned a new lead: ${leadName} from ${company}. Please review their profile in the CRM and arrange an initial follow-up call.\n\nRegards,\nPrismora Sales Desk`
};
