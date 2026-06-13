Opportunity opp = [SELECT Id, Pricebook2Id FROM Opportunity WHERE Name='Acme Robotics - New Platform' LIMIT 1];
Map<String,PricebookEntry> pbe = new Map<String,PricebookEntry>();
for (PricebookEntry e : [SELECT Id, UnitPrice, Product2.ProductCode FROM PricebookEntry WHERE Pricebook2Id=:opp.Pricebook2Id AND Product2.ProductCode IN ('SKU-SEAT','SKU-USAGE')]) pbe.put(e.Product2.ProductCode, e);
Quote q = new Quote(Name='TEST QUOTE (delete me)', OpportunityId=opp.Id, Pricebook2Id=opp.Pricebook2Id, Status='Draft');
insert q;
QuoteLineItem seats = new QuoteLineItem(QuoteId=q.Id, PricebookEntryId=pbe.get('SKU-SEAT').Id, Quantity=25, UnitPrice=1500, Discount=100); // 25 free seats
QuoteLineItem usage = new QuoteLineItem(QuoteId=q.Id, PricebookEntryId=pbe.get('SKU-USAGE').Id, Quantity=120, UnitPrice=1000); // $120k usage pool
insert new List<QuoteLineItem>{seats, usage};
Quote chk = [SELECT TotalPrice, (SELECT Quantity, UnitPrice, Discount, TotalPrice, Product2.ProductCode FROM QuoteLineItems ORDER BY TotalPrice) FROM Quote WHERE Id=:q.Id];
System.debug('QUOTE_TOTAL=' + chk.TotalPrice);
for (QuoteLineItem li : chk.QuoteLineItems) System.debug('QLINE ' + li.Product2.ProductCode + ' qty=' + li.Quantity + ' disc=' + li.Discount + ' total=' + li.TotalPrice);
delete q;
System.debug('QUOTE_CLEANED');
