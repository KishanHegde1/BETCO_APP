const page = (title: string, content: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="index,follow" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, Arial, sans-serif; color: #15223a; background: #f4f7fc; }
      body { margin: 0; line-height: 1.6; }
      main { max-width: 760px; margin: 0 auto; padding: 32px 20px 56px; }
      article { background: #fff; border-radius: 20px; padding: 28px; box-shadow: 0 12px 30px rgba(11, 54, 110, .09); }
      h1 { color: #075fcb; line-height: 1.2; margin: 0 0 8px; }
      h2 { color: #12396c; font-size: 1.12rem; margin-top: 28px; }
      p, li { color: #42536e; }
      a { color: #075fcb; font-weight: 700; }
      .meta { color: #60708a; margin: 0 0 24px; }
      .notice { padding: 16px; border-radius: 12px; background: #eaf3ff; color: #17427e; }
      label { display: block; font-weight: 700; margin: 18px 0 6px; color: #243653; }
      input, textarea { box-sizing: border-box; width: 100%; border: 1px solid #b9c8dc; border-radius: 10px; padding: 12px; font: inherit; }
      textarea { min-height: 110px; resize: vertical; }
      button { border: 0; border-radius: 10px; padding: 13px 18px; margin-top: 20px; background: #0877ee; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
      footer { text-align: center; color: #64748b; font-size: .9rem; margin-top: 20px; }
    </style>
  </head>
  <body><main><article>${content}</article><footer>Betco Aqua Traders</footer></main></body>
</html>`;

export const privacyPolicyPage = (): string =>
  page(
    'Privacy Policy | Betco Traders',
    `<h1>Privacy Policy</h1>
     <p class="meta">Betco Traders by Betco Aqua Traders · Effective 28 August 2026</p>
     <p>This policy explains how the Betco Traders mobile application and its supporting services handle information. The app is a business workspace for authorised dealers, staff and administrators.</p>
     <h2>Information we collect</h2>
     <ul>
       <li>Account and business information, such as username, mobile number, email address, shop name, GSTIN and address.</li>
       <li>Business records needed to provide the app, including orders, stock activity, invoices, payment and ledger information.</li>
       <li>Information entered for PM Surya Ghar applications, including customer contact and address details, electricity details, item records and documents that authorised staff upload.</li>
       <li>Cash-declaration information and an optional proof image when a user chooses to upload one.</li>
     </ul>
     <h2>How we use information</h2>
     <p>We use this information to authenticate users, provide dealer and administration features, manage orders and stock, prepare business and solar-project records, prevent misuse, and meet applicable accounting and legal obligations.</p>
     <h2>Where information is processed</h2>
     <p>Account and business data is stored in Neon PostgreSQL. The API is hosted on Render. Uploaded project documents and proof files are stored with Cloudinary. Tally information is used only for the business integration configured by Betco Aqua Traders. We do not sell personal information.</p>
     <h2>Security</h2>
     <p>The service uses authenticated access, encrypted HTTPS connections, hashed passwords, role-based access controls and restricted document links. Biometric app lock, when enabled, is checked locally by the device and is not sent to our servers.</p>
     <h2>Retention and deletion</h2>
     <p>We keep information only for as long as it is needed for the service, security, accounting, fraud prevention or legal obligations. Business, tax and billing records may need to be retained where law requires it.</p>
     <p class="notice"><strong>Account and data requests:</strong> You can request deletion of your account and associated personal data through our <a href="/account-deletion">Account Deletion page</a>. We verify requests before actioning them and explain any records that must be retained.</p>
     <h2>Your choices</h2>
     <p>You can update most profile information from the app. For access, correction, deletion or privacy questions, use the account-deletion request page and select the contact method you want us to use.</p>
     <h2>Changes to this policy</h2>
     <p>We may update this policy when the app or our legal obligations change. The current version will always be published at this address.</p>`,
  );

export const accountDeletionPage = (): string =>
  page(
    'Account Deletion | Betco Traders',
    `<h1>Request account deletion</h1>
     <p class="meta">Betco Traders by Betco Aqua Traders</p>
     <p>Use this form to request deletion of your Betco Traders account and associated personal data. You do not need the mobile app to submit a request.</p>
     <p class="notice">We will verify the request using the details you provide. Accounting, tax, fraud-prevention or other legally required business records may be retained only for the required period.</p>
     <form method="post" action="/account-deletion">
       <label for="accountIdentifier">Username or registered mobile number</label>
       <input id="accountIdentifier" name="accountIdentifier" autocomplete="username" required maxlength="255" />
       <label for="contact">Email address or mobile number for verification</label>
       <input id="contact" name="contact" autocomplete="email" required maxlength="255" />
       <label for="details">Additional details (optional)</label>
       <textarea id="details" name="details" maxlength="1000"></textarea>
       <button type="submit">Submit deletion request</button>
     </form>
     <p><a href="/privacy-policy">Read the Privacy Policy</a></p>`,
  );

export const accountDeletionConfirmationPage = (reference: string): string =>
  page(
    'Deletion request received | Betco Traders',
    `<h1>Request received</h1>
     <p>Your account-deletion request was submitted successfully.</p>
     <p class="notice">Your reference is <strong>${reference}</strong>. We will use the verification contact you provided before making changes to an account.</p>
     <p><a href="/privacy-policy">Return to the Privacy Policy</a></p>`,
  );
