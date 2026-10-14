// Everything Kathi might want to change without touching the code.
window.KATHI30 = {
  // Google Apps Script web-app URL (ends in /exec). See SETUP.md.
  // Leave empty and the carpool board / guest book only save in each visitor's own browser.
  sheetUrl: 'https://script.google.com/macros/s/AKfycbx_x5c-HrKaMUsGB4pSqLJcYfoeeX5yOCGWg-QYdJ0TwovIwwjvldWO6D73WQIKg_Ow/exec',

  partifulUrl: 'https://partiful.com/e/b0G4uDYWEsWA2FEgCho3?c=vCCWuPwC',
  whatsappUrl: 'https://chat.whatsapp.com/Ko56P8Tn8C963EZoKYfPw3?mode=gi_t',
  venmoUrl: 'https://venmo.com/u/Katharina-Hermann',
  paypalUrl: 'https://www.paypal.com/myaccount/transfer/pay-request/preview?reference_data=dEJFODNKbDlpVGJiWHY4V3BBTFUzbWd0R1YrbjJ1SS80S24yQmNtZUxjaTVkSjgwd1l5RDBXQ0Fycmp5MUYydWl4M25ESnpZRDJ4bDRWT2xUUFY2V3hJTHMybktsek1tU3ZJMW1KSFBEM3JiYjFrQnA5VXZTWVNZemlLeVVzTnNRdkxCNWJyTjlwYkhmYkFPRXhLUDgxT0RuUjNWQkovckhWY1VaR2tqZ3l0b2s3S21Vb1gxMlBMQVQvamU0bWU4RFRwQmw2UUlHVFkyWHBoZFNFMzZsNC9tUk96RHN2eUtxanNOOFg1Zlh6Y1N4LzE2UHU5eEpHSlBMdWFuT2duSWtNSFdUbWxscFM3TE5BajR6NmpMbHI0MkNUejZ4YkgrdUVRc3JaZktMUFdYbFJsZUc3YkFPQnFYdmJVdVVFSWlHOGdrV1NSNUZGbXlPWE0yNVZXcTB3PT0=&intent=p2p_pay_request',
  dayPlaylistUrl: 'https://open.spotify.com/playlist/1RwuGGzyj5nvkEFAkxj9Z1?si=69058dbe0c304ecb&pt=4e7a89d5b80ce366c5cc7f947a376722',
  nightPlaylistUrl: 'https://open.spotify.com/playlist/396Zx7EtZEWKMUfFh9TPTZ?si=b1066a8e208c4370&pt=fedd51927c28bee6a49fb171d1844d70',

  // YouTube or Vimeo link. Empty = "the trailer — premiering soon".
  trailerUrl: '',

  // Guest book stays locked (blurred) until the party starts. Set to false to open it now.
  // (The sheet backend also refuses posts before GUESTBOOK_OPENS in Code.gs — change both.)
  lockGuestbook: true,
  arrival: '2027-01-15T15:00:00-08:00', // countdown target (Pacific time)
  party: '2027-01-16T20:00:00-08:00'    // guest book unlocks
};
