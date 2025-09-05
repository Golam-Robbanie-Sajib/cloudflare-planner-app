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
          
          <h2>4. HOW DO WE HANDLE YOUR SOCIAL LOGINS?</h2>
          <p>
            Our Services offer you the ability to register and log in using your third-party Google account. When you choose to do this, we will receive certain profile information about you from Google, including your name, email address, and profile picture. We will use this information only for the purposes described in this Privacy Notice.
          </p>

          <h2>5. HOW LONG DO WE KEEP YOUR INFORMATION?</h2>
          <p>
            We keep your information for as long as necessary to fulfill the purposes outlined in this Privacy Notice, specifically for the period of time in which you have an account with us. When we have no ongoing legitimate business need to process your personal information, we will either delete or anonymize it.
          </p>
          
          <h2>6. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</h2>
          <p>If you have questions or comments about this notice, you may email us at sajibsqr.48164816@gmail.com.</p>
        </article>
      </div>
    </div>
  );
}