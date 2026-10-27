import { ChatExperience } from '../components/ChatExperience';
import { Icon } from '../components/icons/Icon';
import './ChatPage.css';

export function ChatPage() {
  return (
    <section className="workspace chat">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="message-circle" size={15} /> LUX assistant
          </p>
          <h1>Ask me anything about paying for care</h1>
          <p>
            Chat in your own words, dictate a question, or upload a provider bill and I will read it
            for you.
          </p>
        </div>
      </div>
      <aside className="panel chat__ai-disclosure" aria-labelledby="ai-disclosure-title">
        <div>
          <p className="eyebrow">Transparent AI</p>
          <h2 id="ai-disclosure-title">How LUX assists you</h2>
        </div>
        <ul>
          <li>
            <strong>Uses only authorized information.</strong> Your account, bills, and location are
            used only when you provide them or grant access.
          </li>
          <li>
            <strong>Shows its work.</strong> Bill reading displays extracted details and confidence
            so you can review them before relying on them.
          </li>
          <li>
            <strong>You stay in control.</strong> LUX can prepare a top-up, support request, or bill
            action, but it cannot complete one without your explicit approval.
          </li>
        </ul>
        <p className="muted">
          This environment uses the LUX sandbox assistant. It provides guidance, not medical advice,
          diagnosis, payment approval, or a guarantee of coverage.
        </p>
      </aside>
      <ChatExperience variant="page" />
    </section>
  );
}
