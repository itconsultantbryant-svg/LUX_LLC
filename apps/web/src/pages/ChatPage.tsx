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
      <ChatExperience variant="page" />
    </section>
  );
}
