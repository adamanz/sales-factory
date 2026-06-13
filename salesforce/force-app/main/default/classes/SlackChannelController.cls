/**
 * Backs the slackConversations LWC. Returns the Slack channels linked to a
 * given record via the native Salesforce<>Slack integration object
 * SlackChannelRelatedRecord (system-managed: RelatedRecord holds the record Id
 * as text, so there is no real lookup / related list — hence this controller).
 */
public with sharing class SlackChannelController {
    public class SlackChannel {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public String channel;
        @AuraEnabled public String team;
    }

    @AuraEnabled(cacheable=true)
    public static List<SlackChannel> getChannels(String recordId) {
        List<SlackChannel> out = new List<SlackChannel>();
        if (String.isBlank(recordId)) {
            return out;
        }
        for (SlackChannelRelatedRecord r : [
            SELECT Id, Name, SlackChannel, TopLevelTeam
            FROM SlackChannelRelatedRecord
            WHERE RelatedRecord = :recordId
            ORDER BY CreatedDate DESC
            LIMIT 50
        ]) {
            SlackChannel c = new SlackChannel();
            c.id = r.Id;
            c.name = r.Name;
            c.channel = r.SlackChannel;
            c.team = r.TopLevelTeam;
            out.add(c);
        }
        return out;
    }
}
