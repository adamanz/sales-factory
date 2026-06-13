// ---- Sales Factory demo seed v2: modern AI pricing (idempotent) ----
Pricebook2 std = [SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1];

// Remove old v1 SKUs if present (delete PBEs then products)
Set<String> oldCodes = new Set<String>{'SKU-STARTER','SKU-TEAM','SKU-ENT','SKU-ONB'};
List<PricebookEntry> oldPbes = [SELECT Id FROM PricebookEntry WHERE Product2.ProductCode IN :oldCodes];
if(!oldPbes.isEmpty()) delete oldPbes;
List<Product2> oldProds = [SELECT Id FROM Product2 WHERE ProductCode IN :oldCodes];
if(!oldProds.isEmpty()) delete oldProds;

Map<String,Decimal> price = new Map<String,Decimal>{
  'SKU-SEAT'=>1500, 'SKU-USAGE'=>1000, 'SKU-FDE'=>60000, 'SKU-PREMIUM'=>25000 };
Map<String,String> name = new Map<String,String>{
  'SKU-SEAT'    => 'Platform Seat (per user / year)',
  'SKU-USAGE'   => 'Usage Pool (per $1,000 credit block / year)',
  'SKU-FDE'     => 'Forward Deployed Engineer (per quarter)',
  'SKU-PREMIUM' => 'Premium Support (annual)' };
Map<String,String> family = new Map<String,String>{
  'SKU-SEAT'=>'License', 'SKU-USAGE'=>'Usage', 'SKU-FDE'=>'Services', 'SKU-PREMIUM'=>'Support' };

Map<String,Product2> existing = new Map<String,Product2>();
for (Product2 p : [SELECT Id, ProductCode FROM Product2 WHERE ProductCode IN :price.keySet()]) existing.put(p.ProductCode, p);
List<Product2> toIns = new List<Product2>();
for (String c : price.keySet()) if (!existing.containsKey(c)) toIns.add(new Product2(Name=name.get(c), ProductCode=c, Family=family.get(c), IsActive=true));
if (!toIns.isEmpty()) insert toIns;

Map<String,Id> prodByCode = new Map<String,Id>();
for (Product2 p : [SELECT Id, ProductCode FROM Product2 WHERE ProductCode IN :price.keySet()]) prodByCode.put(p.ProductCode, p.Id);

Set<Id> havePbe = new Set<Id>();
for (PricebookEntry e : [SELECT Product2Id FROM PricebookEntry WHERE Pricebook2Id=:std.Id AND Product2Id IN :prodByCode.values()]) havePbe.add(e.Product2Id);
List<PricebookEntry> pbes = new List<PricebookEntry>();
for (String c : price.keySet()) { Id pid=prodByCode.get(c); if(!havePbe.contains(pid)) pbes.add(new PricebookEntry(Pricebook2Id=std.Id, Product2Id=pid, UnitPrice=price.get(c), IsActive=true, UseStandardPrice=false)); }
if (!pbes.isEmpty()) insert pbes;
Map<String,Id> pbeByCode = new Map<String,Id>();
for (PricebookEntry e : [SELECT Id, Product2.ProductCode FROM PricebookEntry WHERE Pricebook2Id=:std.Id AND Product2Id IN :prodByCode.values()]) pbeByCode.put(e.Product2.ProductCode, e.Id);

List<Account> accs = [SELECT Id FROM Account WHERE Name='Acme Robotics' LIMIT 1];
Account acc = accs.isEmpty() ? new Account(Name='Acme Robotics', Industry='Manufacturing') : accs[0];
if (accs.isEmpty()) insert acc;
List<Opportunity> opps = [SELECT Id FROM Opportunity WHERE Name='Acme Robotics - New Platform' LIMIT 1];
Opportunity opp = opps.isEmpty() ? new Opportunity(Name='Acme Robotics - New Platform', AccountId=acc.Id, StageName='Qualification', CloseDate=Date.today().addDays(30), Pricebook2Id=std.Id) : opps[0];
if (opps.isEmpty()) insert opp;

System.debug('SEED_RESULT std=' + std.Id + ' acc=' + acc.Id + ' opp=' + opp.Id);
for (String c : pbeByCode.keySet()) System.debug('SEED_SKU ' + c + ' pbe=' + pbeByCode.get(c) + ' price=' + price.get(c));
