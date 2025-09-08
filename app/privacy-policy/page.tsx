// app/privacy-policy/page.tsx

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-slate-50">
      <div className="container mx-auto max-w-3xl px-4 py-16">
        {/* Use the 'prose' class for beautiful default text styling */}
        <article className="prose prose-slate lg:prose-lg">
          <h1>Privacy Policy</h1>
          <p className="lead">Last updated: September 05, 2025</p>

          <p>
            This Privacy Notice for TaskFlow ("we," "us," or "our"), describes how and why we might access, collect, store, use, and/or share your personal information when you use our services ("Services"), including when you visit our website at <a href="https://cloudflare-planner-app.pages.dev/">https://cloudflare-planner-app.pages.dev/</a> or use the TaskFlow application.
          </p>

          <p>
            <strong>Questions or concerns?</strong> Reading this Privacy Notice will help you understand your privacy rights and choices. If you do not agree with our policies and practices, please do not use our Services. If you still have any questions, please contact us at sajibsqr.48164816@gmail.com.
          </p>

          <h2>1. WHAT INFORMATION DO WE COLLECT?</h2>
          <h4>Personal information you disclose to us</h4>
          <p>
            We collect personal information that you voluntarily provide to us when you register on the Services, express an interest in obtaining information about us or our products and Services, when you participate in activities on the Services, or otherwise when you contact us.
          </p>
          <p>
            The personal information we collect may include the following:
          </p>
          <ul>
            <li>Names</li>
            <li>Email addresses</li>
            <li>Profile Picture URL</li>
          </ul>

          <h4>Information automatically collected</h4>
          <p>
            Some information — such as your Internet Protocol (IP) address and/or browser and device characteristics — is collected automatically when you visit our Services. This information is primarily needed to maintain the security and operation of our Services, and for our internal analytics and reporting purposes. The information we collect includes:
          </p>
          <ul>
            <li><strong>Log and Usage Data:</strong> Service-related, diagnostic, usage, and performance information our servers automatically collect.</li>
            <li><strong>Device Data:</strong> Information about your computer, phone, tablet, or other device you use to access the Services.</li>
            <li><strong>Location Data:</strong> Information about your device's location, which can be derived from your IP address.</li>
          </ul>

          <h2>2. HOW DO WE PROCESS YOUR INFORMATION?</h2>
          <p>
            We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We process your information only when we have a valid legal reason to do so. This includes facilitating account creation, delivering the service to you, protecting our services, and identifying usage trends to improve the app.
          </p>

          <h2>3. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?</h2>
          <p>
            Yes. We may use cookies and similar tracking technologies to gather information when you interact with our Services. Our partners, such as Firebase and Cloudflare, use cookies to provide essential functions like authentication and security.
          </p>
          
          <h2>4. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</h2>
          <p>
            <i>In Short: We may share information in specific situations described in this section and/or with the following third parties to provide and improve our Services.</i>
          </p>
          <p>
            We share your personal information with the following third-party service providers:
          </p>
          <ul>
            <li>
              <strong>Google Firebase:</strong> We use Firebase for backend services, including user authentication via Google Sign-In. When you log in with Google, your Google user data (name, email, and profile picture URL) is managed by Firebase to create and maintain your account.
            </li>
            <li>
              <strong>Cloudflare:</strong> Our website and services are hosted on Cloudflare Pages. Cloudflare processes data that passes through its network to provide security, performance, and reliability. This includes Log and Usage Data, Device Data, and Location Data.
            </li>
            <li>
              <strong>Google Cloud AI:</strong> We use Google Cloud AI to power the AI features within TaskFlow. To provide these services, we may process your information with Google Cloud AI. We do not use user-provided content to train our models.
            </li>
          </ul>
          <p>
            We may also need to share your personal information in the following situations:
          </p>
          <ul>
              <li><strong>Business Transfers.</strong> We may share or transfer your information in connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business to another company.</li>
              <li><strong>Legal Obligations.</strong> We may disclose your information where we are legally required to do so in order to comply with applicable law, governmental requests, a judicial proceeding, court order, or legal process.</li>
          </ul>

          <h2>5. HOW DO WE HANDLE YOUR SOCIAL LOGINS?</h2>
          <p>
            Our Services offer you the ability to register and log in using your third-party Google account. When you choose to do this, we will receive certain profile information about you from Google, including your name, email address, and profile picture. We will use this information only for the purposes described in this Privacy Notice and share it only with the third parties outlined in the "WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?" section.
          </p>

          <h2>6. HOW DO WE KEEP YOUR INFORMATION SAFE?</h2>
          <p>
            <i>In Short: We aim to protect your personal information through a system of organizational and technical security measures.</i>
          </p>
          <p>
            We have implemented appropriate and reasonable technical and organizational security measures designed to protect the security of any personal information we process. This includes:
          </p>
          <ul>
              <li>
              <strong>Encryption in Transit:</strong> All data transferred between you and our Services is encrypted using Transport Layer Security (TLS).
              </li>
              <li>
              <strong>Encryption at Rest:</strong> Your personal information is stored in an encrypted format on secure servers managed by our trusted partners, such as Google Firebase.
              </li>
              <li>
              <strong>Access Controls:</strong> We limit access to personal information to authorized personnel who require it to perform their job functions.
              </li>
          </ul>
          <p>
              However, despite our safeguards and efforts to secure your information, no electronic transmission over the Internet or information storage technology can be guaranteed to be 100% secure. We cannot promise or guarantee that hackers, cybercriminals, or other unauthorized third parties will not be able to defeat our security and improperly collect, access, steal, or modify your information. Although we will do our best to protect your personal information, transmission of personal information to and from our Services is at your own risk. You should only access the Services within a secure environment.
          </p>

          <h2>7. HOW LONG DO WE KEEP YOUR INFORMATION?</h2>
          <p>
            We keep your information for as long as necessary to fulfill the purposes outlined in this Privacy Notice, specifically for the period of time in which you have an account with us. When we have no ongoing legitimate business need to process your personal information, we will either delete or anonymize it.
          </p>
          
          <h2>8. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</h2>
          <p>If you have questions or comments about this notice, you may email us at sajibsqr.48164816@gmail.com.</p>
        </article>
      </div>
    </div>
  );
}