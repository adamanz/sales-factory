import { LightningElement, api, wire } from 'lwc';
import getChannels from '@salesforce/apex/SlackChannelController.getChannels';

export default class SlackConversations extends LightningElement {
    @api recordId;
    channels = [];
    error;

    @wire(getChannels, { recordId: '$recordId' })
    wiredChannels({ data, error }) {
        if (data) {
            this.channels = data.map((c) => ({
                ...c,
                href: c.channel
                    ? `https://app.slack.com/client/${c.team || ''}/${c.channel}`
                    : null
            }));
            this.error = undefined;
        } else if (error) {
            this.error = (error.body && error.body.message) || 'Unable to load Slack channels.';
            this.channels = [];
        }
    }

    get hasChannels() {
        return this.channels && this.channels.length > 0;
    }
}
