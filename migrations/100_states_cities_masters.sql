-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — State and City masters (owner request, 2026-11-23).
--  Apply: npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f migrations/100_states_cities_masters.sql
--  Safe to run more than once. Needs 014/017 (current_app_email, my_role_name) and 040 (audit_row, stamp_modified).
--  TAKE A BACKUP FIRST (node scripts/make-backup.mjs): the rename routine below rewrites state/city text in other tables.
--
--  WHAT IS WRONG
--  The State and City dropdowns read a fixed list in the code (indianStatesDistricts.js: 36 states,
--  779 districts) and some towns are missing. Nobody could add one. Orders, Distributors, Dealers and
--  Retailers took the city as free text, so the same town was spelled several ways.
--
--  WHAT THIS ADDS
--  1. geo_states and geo_cities (each city belongs to one state), seeded with the 36 states and
--     union territories, the 779 districts, and every state/city already stored in leads, orders,
--     distributors, dealers, retailers and territories that is not in them.
--  2. Duplicates are refused whatever the capitals, spaces or "&" / "and" (geo_key): "Navi  Mumbai",
--     "navi mumbai" and "NAVIMUMBAI" are one city. Name rule: 2-60 characters, letters/digits,
--     spaces and . ' & ( ) -, starting with a letter. Spaces are tidied.
--  3. WHO MAY DO WHAT
--       read            every signed-in user; sign-up pages read active names through two views (anon)
--       add a city      Super Admin, Admin, Sales Manager, Sales Executive (add_city function)
--       add a state, rename, switch on/off, delete (if unused)   Super Admin and Admin only
--  4. NO HARD DELETE IN USE: a state/city that any lead, order, partner, territory, scheme or the
--     company settings still names cannot be deleted (switch it off instead). A state with cities
--     cannot be deleted.
--  5. RENAME KEEPS EVERYTHING WORKING: renaming a city (or state) rewrites, in the same transaction,
--     the matching text in territories.districts (public_territories is a view over it, so it follows),
--     leads, orders, distributors, dealers, retailers (and, for a state: territories.state,
--     company_settings.state, invoices."sellerState", schemes.states). Order routing (076) matches a
--     city to a territory's districts by name, so a rename that missed the districts would stop it.
--  6. Existing values keep working: nothing stored is rewritten by this migration; rows keep their
--     text. Switching a city off hides it from new choices only.
--  The screens work with or without this file: they read geo_states once per session and fall
--  back to the lists in the code when the table is missing.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Name helpers ─────────────────────────────────────────────────────
-- Tidy: trim, collapse runs of spaces.
CREATE OR REPLACE FUNCTION public.geo_tidy(p text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')) $$;

-- Comparison key: no capitals, no spaces, "&" = "and".
CREATE OR REPLACE FUNCTION public.geo_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT lower(regexp_replace(replace(coalesce(p, ''), '&', 'and'), '\s+', '', 'g')) $$;

-- The clean-name rule.
CREATE OR REPLACE FUNCTION public.geo_name_ok(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE
AS $$ SELECT public.geo_tidy(p) ~ '^[[:alpha:]][[:alnum:] .''&()-]{1,59}$' $$;

-- ── 2. Tables ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.geo_states (
  id          text PRIMARY KEY DEFAULT 'GS-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  name        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" text
);
CREATE TABLE IF NOT EXISTS public.geo_cities (
  id          text PRIMARY KEY DEFAULT 'GC-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  "stateId"   text NOT NULL REFERENCES public.geo_states(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" text
);
CREATE UNIQUE INDEX IF NOT EXISTS geo_states_name_key ON public.geo_states (public.geo_key(name));
CREATE UNIQUE INDEX IF NOT EXISTS geo_cities_state_name_key ON public.geo_cities ("stateId", public.geo_key(name));
CREATE INDEX IF NOT EXISTS geo_cities_state_idx ON public.geo_cities ("stateId");

-- Tidy and check every name written, by anyone (seed included).
CREATE OR REPLACE FUNCTION public.geo_check_name()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.name := public.geo_tidy(NEW.name);
  IF NOT public.geo_name_ok(NEW.name) THEN
    RAISE EXCEPTION 'Not a valid % name: "%". Use 2 to 60 characters: letters, numbers, spaces and . '' & ( ) - only, starting with a letter.',
      CASE TG_TABLE_NAME WHEN 'geo_states' THEN 'state' ELSE 'city' END, NEW.name;
  END IF;
  RETURN NEW;
END $$;

-- A friendlier message than the unique-index error.
CREATE OR REPLACE FUNCTION public.geo_check_duplicate()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_other text;
BEGIN
  IF TG_TABLE_NAME = 'geo_states' THEN
    SELECT name INTO v_other FROM public.geo_states
     WHERE public.geo_key(name) = public.geo_key(NEW.name) AND id <> NEW.id LIMIT 1;
    IF v_other IS NOT NULL THEN
      RAISE EXCEPTION 'The state "%" already exists as "%".', NEW.name, v_other;
    END IF;
  ELSE
    SELECT c.name INTO v_other FROM public.geo_cities c
     WHERE c."stateId" = NEW."stateId" AND public.geo_key(c.name) = public.geo_key(NEW.name) AND c.id <> NEW.id LIMIT 1;
    IF v_other IS NOT NULL THEN
      RAISE EXCEPTION 'The city "%" already exists in this state as "%".', NEW.name, v_other;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS a_geo_check_name ON public.geo_states;
CREATE TRIGGER a_geo_check_name BEFORE INSERT OR UPDATE OF name ON public.geo_states
  FOR EACH ROW EXECUTE FUNCTION public.geo_check_name();
DROP TRIGGER IF EXISTS b_geo_check_duplicate ON public.geo_states;
CREATE TRIGGER b_geo_check_duplicate BEFORE INSERT OR UPDATE OF name ON public.geo_states
  FOR EACH ROW EXECUTE FUNCTION public.geo_check_duplicate();
DROP TRIGGER IF EXISTS a_geo_check_name ON public.geo_cities;
CREATE TRIGGER a_geo_check_name BEFORE INSERT OR UPDATE OF name ON public.geo_cities
  FOR EACH ROW EXECUTE FUNCTION public.geo_check_name();
DROP TRIGGER IF EXISTS b_geo_check_duplicate ON public.geo_cities;
CREATE TRIGGER b_geo_check_duplicate BEFORE INSERT OR UPDATE OF name, "stateId" ON public.geo_cities
  FOR EACH ROW EXECUTE FUNCTION public.geo_check_duplicate();

-- Last-changed stamp (the audit trail is switched on after the seed, section 3b).
DROP TRIGGER IF EXISTS stamp_modified ON public.geo_states;
CREATE TRIGGER stamp_modified BEFORE INSERT OR UPDATE ON public.geo_states
  FOR EACH ROW EXECUTE FUNCTION public.stamp_modified();
DROP TRIGGER IF EXISTS stamp_modified ON public.geo_cities;
CREATE TRIGGER stamp_modified BEFORE INSERT OR UPDATE ON public.geo_cities
  FOR EACH ROW EXECUTE FUNCTION public.stamp_modified();

-- ── 3. Seed (36 states / union territories, 779 districts) ──────────────
DO $seed$
DECLARE v_seed jsonb := $json${"Andhra Pradesh":["Anantapur","Chittoor","East Godavari","Guntur","Kadapa","Krishna","Kurnool","Nellore","Prakasam","Srikakulam","Visakhapatnam","Vizianagaram","West Godavari","Anakapalli","Kona Seema","Eluru","NTR","Bapatla","Palnadu","Nandyal","Sri Sathya Sai","Parvathipuram Manyam","Alluri Sitharama Raju","Tirupati","Annamayya"],"Arunachal Pradesh":["Anjaw","Changlang","East Kameng","East Siang","Kamle","Kra Daadi","Kurung Kumey","Lepa Rada","Lohit","Longding","Lower Dibang Valley","Lower Siang","Lower Subansiri","Namsai","Pakke Kessang","Papum Pare","Shi Yomi","Siang","Tawang","Tirap","Upper Siang","Upper Subansiri","West Kameng","West Siang"],"Assam":["Baksa","Barpeta","Biswanath","Bongaigaon","Cachar","Charaideo","Chirang","Darrang","Dhemaji","Dhubri","Dibrugarh","Dima Hasao","Goalpara","Golaghat","Hailakandi","Hojai","Jorhat","Kamrup","Kamrup Metro","Karbi Anglong","Karimganj","Kokrajhar","Lakhimpur","Majuli","Morigaon","Nagaon","Nalbari","Sivasagar","Sonitpur","South Salmara-Mankachar","Tinsukia","Udalguri","West Karbi Anglong","Tamulpur","Bajali"],"Bihar":["Araria","Arwal","Aurangabad","Banka","Begusarai","Bhagalpur","Bhojpur","Buxar","Darbhanga","East Champaran","Gaya","Gopalganj","Jamui","Jehanabad","Kaimur","Katihar","Khagaria","Kishanganj","Lakhisarai","Madhepura","Madhubani","Munger","Muzaffarpur","Nalanda","Nawada","Patna","Purnia","Rohtas","Saharsa","Samastipur","Saran","Sheikhpura","Sheohar","Sitamarhi","Siwan","Supaul","Vaishali","West Champaran"],"Chhattisgarh":["Balod","Baloda Bazar","Balrampur","Bastar","Bemetara","Bijapur","Bilaspur","Dantewada","Dhamtari","Durg","Gariaband","Gaurela-Pendra-Marwahi","Janjgir-Champa","Jashpur","Kabirdham","Kanker","Kondagaon","Korba","Koriya","Mahasamund","Mungeli","Narayanpur","Raigarh","Raipur","Rajnandgaon","Sukma","Surajpur","Surguja","Manendragarh-Chirmiri-Bharatpur","Mohla-Manpur-Ambagarh Chowki","Sakti","Sarangarh-Bilaigarh","Khairagarh-Chhuikhadan-Gandai"],"Goa":["North Goa","South Goa"],"Gujarat":["Ahmedabad","Amreli","Anand","Aravalli","Banaskantha","Bharuch","Bhavnagar","Botad","Chhota Udepur","Dahod","Dang","Devbhumi Dwarka","Gandhinagar","Gir Somnath","Jamnagar","Junagadh","Kheda","Kutch","Mahisagar","Mehsana","Morbi","Narmada","Navsari","Panchmahal","Patan","Porbandar","Rajkot","Sabarkantha","Surat","Surendranagar","Tapi","Vadodara","Valsad"],"Haryana":["Ambala","Bhiwani","Charkhi Dadri","Faridabad","Fatehabad","Gurugram","Hisar","Jhajjar","Jind","Kaithal","Karnal","Kurukshetra","Mahendragarh","Nuh","Palwal","Panchkula","Panipat","Rewari","Rohtak","Sirsa","Sonipat","Yamunanagar"],"Himachal Pradesh":["Bilaspur","Chamba","Hamirpur","Kangra","Kinnaur","Kullu","Lahaul and Spiti","Mandi","Shimla","Sirmaur","Solan","Una"],"Jammu & Kashmir":["Anantnag","Bandipora","Baramulla","Budgam","Doda","Ganderbal","Jammu","Kathua","Kishtwar","Kulgam","Kupwara","Poonch","Pulwama","Rajouri","Ramban","Reasi","Samba","Shopian","Srinagar","Udhampur"],"Jharkhand":["Bokaro","Chatra","Deoghar","Dhanbad","Dumka","East Singhbhum","Garhwa","Giridih","Godda","Gumla","Hazaribagh","Jamtara","Khunti","Koderma","Latehar","Lohardaga","Pakur","Palamu","Ramgarh","Ranchi","Sahibganj","Seraikela Kharsawan","Simdega","West Singhbhum"],"Karnataka":["Bagalkot","Ballari","Belagavi","Bengaluru Rural","Bengaluru Urban","Bidar","Chamarajanagar","Chikkaballapur","Chikkamagaluru","Chitradurga","Dakshina Kannada","Davanagere","Dharwad","Gadag","Hassan","Haveri","Kalaburagi","Kodagu","Kolar","Koppal","Mandya","Mysuru","Raichur","Ramanagara","Shivamogga","Tumakuru","Udupi","Uttara Kannada","Vijayapura","Yadgir","Vijayanagara"],"Kerala":["Alappuzha","Ernakulam","Idukki","Kannur","Kasaragod","Kollam","Kottayam","Kozhikode","Malappuram","Palakkad","Pathanamthitta","Thiruvananthapuram","Thrissur","Wayanad"],"Madhya Pradesh":["Agar Malwa","Alirajpur","Anuppur","Ashoknagar","Balaghat","Barwani","Betul","Bhind","Bhopal","Burhanpur","Chhatarpur","Chhindwara","Damoh","Datia","Dewas","Dhar","Dindori","Guna","Gwalior","Harda","Narmadapuram","Indore","Jabalpur","Jhabua","Katni","Khandwa","Khargone","Mandla","Mandsaur","Morena","Narsinghpur","Neemuch","Niwari","Panna","Raisen","Rajgarh","Ratlam","Rewa","Sagar","Satna","Sehore","Seoni","Shahdol","Shajapur","Sheopur","Shivpuri","Sidhi","Singrauli","Tikamgarh","Ujjain","Umaria","Vidisha","Mauganj","Maihar","Chachoura"],"Maharashtra":["Ahmednagar","Akola","Amravati","Aurangabad","Beed","Bhandara","Buldhana","Chandrapur","Dhule","Gadchiroli","Gondia","Hingoli","Jalgaon","Jalna","Kolhapur","Latur","Mumbai City","Mumbai Suburban","Nagpur","Nanded","Nandurbar","Nashik","Osmanabad","Palghar","Parbhani","Pune","Raigad","Ratnagiri","Sangli","Satara","Sindhudurg","Solapur","Thane","Wardha","Washim","Yavatmal"],"Manipur":["Bishnupur","Chandel","Churachandpur","Imphal East","Imphal West","Jiribam","Kakching","Kamjong","Kangpokpi","Noney","Pherzawl","Senapati","Tamenglong","Tengnoupal","Thoubal","Ukhrul"],"Meghalaya":["East Garo Hills","East Jaintia Hills","East Khasi Hills","North Garo Hills","Ribhoi","South Garo Hills","South West Garo Hills","South West Khasi Hills","West Garo Hills","West Jaintia Hills","West Khasi Hills","Eastern West Khasi Hills"],"Mizoram":["Aizawl","Champhai","Hnahthial","Khawzawl","Kolasib","Lawngtlai","Lunglei","Mamit","Saiha","Saitual","Serchhip"],"Nagaland":["Chümoukedima","Dimapur","Kiphire","Kohima","Longleng","Mokokchung","Mon","Niuland","Noklak","Peren","Phek","Shamator","Tseminyü","Tuensang","Wokha","Zunheboto"],"Odisha":["Angul","Balangir","Balasore","Bargarh","Bhadrak","Boudh","Cuttack","Deogarh","Dhenkanal","Gajapati","Ganjam","Jagatsinghpur","Jajpur","Jharsuguda","Kalahandi","Kandhamal","Kendrapara","Kendujhar","Khordha","Koraput","Malkangiri","Mayurbhanj","Nabarangpur","Nayagarh","Nuapada","Puri","Rayagada","Sambalpur","Subarnapur","Sundargarh"],"Punjab":["Amritsar","Barnala","Bathinda","Faridkot","Fatehgarh Sahib","Fazilka","Ferozepur","Gurdaspur","Hoshiarpur","Jalandhar","Kapurthala","Ludhiana","Malerkotla","Mansa","Moga","Muktsar","Pathankot","Patiala","Rupnagar","SAS Nagar (Mohali)","Sangrur","SBS Nagar","Tarn Taran"],"Rajasthan":["Ajmer","Alwar","Banswara","Baran","Barmer","Bharatpur","Bhilwara","Bikaner","Bundi","Chittorgarh","Churu","Dausa","Dholpur","Dungarpur","Hanumangarh","Jaipur","Jaisalmer","Jalore","Jhalawar","Jhunjhunu","Jodhpur","Karauli","Kota","Nagaur","Pali","Pratapgarh","Rajsamand","Sawai Madhopur","Sikar","Sirohi","Sri Ganganagar","Tonk","Udaipur","Balotra","Beawar","Anupgarh","Didwana-Kuchaman","Deeg","Dudu","Gangapur City","Kekri","Kotputli-Behror","Khairthal-Tijara","Neem Ka Thana","Phalodi","Salumbar","Sanchore","Shahpura"],"Sikkim":["East Sikkim","North Sikkim","South Sikkim","West Sikkim","Pakyong","Soreng"],"Tamil Nadu":["Ariyalur","Chengalpattu","Chennai","Coimbatore","Cuddalore","Dharmapuri","Dindigul","Erode","Kallakurichi","Kanchipuram","Kanyakumari","Karur","Krishnagiri","Madurai","Mayiladuthurai","Nagapattinam","Namakkal","Nilgiris","Perambalur","Pudukkottai","Ramanathapuram","Ranipet","Salem","Sivaganga","Tenkasi","Thanjavur","Theni","Thoothukudi","Tiruchirappalli","Tirunelveli","Tirupathur","Tiruppur","Tiruvallur","Tiruvannamalai","Tiruvarur","Vellore","Viluppuram","Virudhunagar"],"Telangana":["Adilabad","Bhadradri Kothagudem","Hanamkonda","Hyderabad","Jagtial","Jangaon","Jayashankar Bhupalpally","Jogulamba Gadwal","Kamareddy","Karimnagar","Khammam","Kumuram Bheem Asifabad","Mahabubabad","Mahabubnagar","Mancherial","Medak","Medchal-Malkajgiri","Mulugu","Nagarkurnool","Nalgonda","Narayanpet","Nirmal","Nizamabad","Peddapalli","Rajanna Sircilla","Rangareddy","Sangareddy","Siddipet","Suryapet","Vikarabad","Wanaparthy","Warangal","Yadadri Bhuvanagiri"],"Tripura":["Dhalai","Gomati","Khowai","North Tripura","Sepahijala","South Tripura","Unakoti","West Tripura"],"Uttar Pradesh":["Agra","Aligarh","Ambedkar Nagar","Amethi","Amroha","Auraiya","Ayodhya","Azamgarh","Baghpat","Bahraich","Ballia","Balrampur","Banda","Barabanki","Bareilly","Basti","Bhadohi","Bijnor","Budaun","Bulandshahr","Chandauli","Chitrakoot","Deoria","Etah","Etawah","Farrukhabad","Fatehpur","Firozabad","Gautam Buddha Nagar (Noida)","Ghaziabad","Ghazipur","Gonda","Gorakhpur","Hamirpur","Hapur","Hardoi","Hathras","Jalaun","Jaunpur","Jhansi","Kannauj","Kanpur Dehat","Kanpur Nagar","Kasganj","Kaushambi","Kushinagar","Lakhimpur Kheri","Lalitpur","Lucknow","Maharajganj","Mahoba","Mainpuri","Mathura","Mau","Meerut","Mirzapur","Moradabad","Muzaffarnagar","Pilibhit","Pratapgarh","Prayagraj","Raebareli","Rampur","Saharanpur","Sambhal","Sant Kabir Nagar","Shahjahanpur","Shamli","Shravasti","Siddharthnagar","Sitapur","Sonbhadra","Sultanpur","Unnao","Varanasi"],"Uttarakhand":["Almora","Bageshwar","Chamoli","Champawat","Dehradun","Haridwar","Nainital","Pauri Garhwal","Pithoragarh","Rudraprayag","Tehri Garhwal","Udham Singh Nagar","Uttarkashi"],"West Bengal":["Alipurduar","Bankura","Birbhum","Cooch Behar","Dakshin Dinajpur","Darjeeling","Hooghly","Howrah","Jalpaiguri","Jhargram","Kalimpong","Malda","Murshidabad","Nadia","North 24 Parganas","Paschim Bardhaman","Paschim Medinipur","Purba Bardhaman","Purba Medinipur","Purulia","South 24 Parganas","Uttar Dinajpur"],"Andaman and Nicobar Islands":["Nicobar","North and Middle Andaman","South Andaman"],"Chandigarh":["Chandigarh"],"Dadra and Nagar Haveli and Daman and Diu":["Dadra and Nagar Haveli","Daman","Diu"],"Delhi":["New Delhi","North Delhi","South Delhi","East Delhi","West Delhi","Central Delhi","North West Delhi","North East Delhi","South West Delhi","South East Delhi"],"Ladakh":["Kargil","Leh"],"Lakshadweep":["Lakshadweep"],"Puducherry":["Karaikal","Mahe","Puducherry","Yanam"]}$json$;
BEGIN
  INSERT INTO public.geo_states (name)
  SELECT s.key FROM jsonb_each(v_seed) s
   WHERE NOT EXISTS (SELECT 1 FROM public.geo_states g WHERE public.geo_key(g.name) = public.geo_key(s.key));

  INSERT INTO public.geo_cities ("stateId", name)
  SELECT g.id, c.city
    FROM jsonb_each(v_seed) s
    JOIN public.geo_states g ON public.geo_key(g.name) = public.geo_key(s.key)
    CROSS JOIN LATERAL jsonb_array_elements_text(s.value) AS c(city)
   WHERE NOT EXISTS (SELECT 1 FROM public.geo_cities x
                      WHERE x."stateId" = g.id AND public.geo_key(x.name) = public.geo_key(c.city));
END $seed$;

-- Every state and city already stored somewhere, not in the lists yet (clean names only).
DO $live$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (public.geo_key(st)) public.geo_tidy(st) AS st
      FROM (SELECT state AS st FROM public.leads UNION ALL SELECT state FROM public.orders
            UNION ALL SELECT state FROM public.distributors UNION ALL SELECT state FROM public.dealers
            UNION ALL SELECT state FROM public.retailers UNION ALL SELECT state FROM public.territories
            UNION ALL SELECT state FROM public.company_settings) u
     WHERE public.geo_name_ok(st)
       AND NOT EXISTS (SELECT 1 FROM public.geo_states g WHERE public.geo_key(g.name) = public.geo_key(st))
     ORDER BY public.geo_key(st), st
  LOOP
    INSERT INTO public.geo_states (name) VALUES (r.st);
  END LOOP;

  FOR r IN
    SELECT DISTINCT ON (g.id, public.geo_key(u.city)) g.id AS state_id, public.geo_tidy(u.city) AS city
      FROM (SELECT state, city FROM public.leads UNION ALL SELECT state, city FROM public.orders
            UNION ALL SELECT state, city FROM public.distributors UNION ALL SELECT state, city FROM public.dealers
            UNION ALL SELECT state, city FROM public.retailers
            UNION ALL SELECT t.state, d.d FROM public.territories t,
                      LATERAL jsonb_array_elements_text(coalesce(t.districts, '[]'::jsonb)) AS d(d)) u
      JOIN public.geo_states g ON public.geo_key(g.name) = public.geo_key(u.state)
     WHERE public.geo_name_ok(u.city)
       AND NOT EXISTS (SELECT 1 FROM public.geo_cities x
                        WHERE x."stateId" = g.id AND public.geo_key(x.name) = public.geo_key(u.city))
     ORDER BY g.id, public.geo_key(u.city), u.city
  LOOP
    INSERT INTO public.geo_cities ("stateId", name) VALUES (r.state_id, r.city);
  END LOOP;
END $live$;

-- ── 3b. Audit trail (after the seed, so the 800 seed rows are not logged one by one) ──
DROP TRIGGER IF EXISTS audit_row ON public.geo_states;
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.geo_states
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();
DROP TRIGGER IF EXISTS audit_row ON public.geo_cities;
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.geo_cities
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- ── 4. Who may write ────────────────────────────────────────────────────
ALTER TABLE public.geo_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_cities ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.geo_may_manage()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT coalesce(public.my_role_name() IN ('Super Admin', 'Admin'), false) $$;

CREATE OR REPLACE FUNCTION public.geo_may_add_city()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT coalesce(public.my_role_name() IN ('Super Admin', 'Admin', 'Sales Manager', 'Sales Executive'), false) $$;

DROP POLICY IF EXISTS geo_states_read ON public.geo_states;
CREATE POLICY geo_states_read ON public.geo_states FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS geo_states_write ON public.geo_states;
CREATE POLICY geo_states_write ON public.geo_states FOR ALL TO authenticated
  USING (public.geo_may_manage()) WITH CHECK (public.geo_may_manage());
DROP POLICY IF EXISTS geo_cities_read ON public.geo_cities;
CREATE POLICY geo_cities_read ON public.geo_cities FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS geo_cities_write ON public.geo_cities;
CREATE POLICY geo_cities_write ON public.geo_cities FOR ALL TO authenticated
  USING (public.geo_may_manage()) WITH CHECK (public.geo_may_manage());

REVOKE ALL ON public.geo_states, public.geo_cities FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_states, public.geo_cities TO authenticated;

-- ── 5. Add a city (Sales roles too) ─────────────────────────────────────
-- Returns the city row. The same city again (any capitals/spaces) returns the existing row with
-- "existing": true so the screen can simply select it. An all-lower or all-capitals entry is
-- written in Title Case ("navi mumbai" -> "Navi Mumbai").
CREATE OR REPLACE FUNCTION public.add_city(p_state_id text, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_state public.geo_states;
  v_name text := public.geo_tidy(p_name);
  v_row public.geo_cities;
BEGIN
  IF NOT public.geo_may_add_city() THEN
    RAISE EXCEPTION 'Only Admin, Sales Manager or Sales Executive can add a city.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_state FROM public.geo_states WHERE id = p_state_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'That state was not found.'; END IF;
  IF NOT v_state.active THEN
    RAISE EXCEPTION 'The state % is switched off, so cities cannot be added to it.', v_state.name;
  END IF;
  IF v_name = lower(v_name) OR v_name = upper(v_name) THEN v_name := initcap(v_name); END IF;
  IF NOT public.geo_name_ok(v_name) THEN
    RAISE EXCEPTION 'Not a valid city name: "%". Use 2 to 60 characters: letters, numbers, spaces and . '' & ( ) - only, starting with a letter.', v_name;
  END IF;

  SELECT * INTO v_row FROM public.geo_cities
   WHERE "stateId" = p_state_id AND public.geo_key(name) = public.geo_key(v_name);
  IF FOUND THEN
    IF NOT v_row.active THEN
      RAISE EXCEPTION 'The city "%" exists in % but is switched off. Ask an Admin to switch it on.', v_row.name, v_state.name;
    END IF;
    RETURN to_jsonb(v_row) || jsonb_build_object('existing', true);
  END IF;

  INSERT INTO public.geo_cities ("stateId", name) VALUES (p_state_id, v_name) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row) || jsonb_build_object('existing', false);
END $fn$;
REVOKE ALL ON FUNCTION public.add_city(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_city(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.geo_may_manage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.geo_may_add_city() TO authenticated;

-- ── 6. Rename keeps the rest working ────────────────────────────────────
-- Rewrites the matching text in the same transaction as the rename. Definer, so it does not depend on
-- the renamer's rights on those tables (only Admin/Super Admin can rename; see the policies).
CREATE OR REPLACE FUNCTION public.geo_rename_cascade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_state text; okey text := public.geo_key(OLD.name);
BEGIN
  IF NEW.name IS NOT DISTINCT FROM OLD.name THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'geo_cities' THEN
    SELECT name INTO v_state FROM public.geo_states WHERE id = NEW."stateId";
    UPDATE public.territories t SET districts = (
        SELECT coalesce(jsonb_agg(CASE WHEN public.geo_key(e.v) = okey THEN to_jsonb(NEW.name) ELSE to_jsonb(e.v) END ORDER BY e.n), '[]'::jsonb)
          FROM jsonb_array_elements_text(t.districts) WITH ORDINALITY AS e(v, n))
     WHERE public.geo_key(t.state) = public.geo_key(v_state)
       AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(t.districts) AS e(v) WHERE public.geo_key(e.v) = okey);
    UPDATE public.leads        SET city = NEW.name WHERE public.geo_key(state) = public.geo_key(v_state) AND public.geo_key(city) = okey AND city <> NEW.name;
    UPDATE public.orders       SET city = NEW.name WHERE public.geo_key(state) = public.geo_key(v_state) AND public.geo_key(city) = okey AND city <> NEW.name;
    UPDATE public.distributors SET city = NEW.name WHERE public.geo_key(state) = public.geo_key(v_state) AND public.geo_key(city) = okey AND city <> NEW.name;
    UPDATE public.dealers      SET city = NEW.name WHERE public.geo_key(state) = public.geo_key(v_state) AND public.geo_key(city) = okey AND city <> NEW.name;
    UPDATE public.retailers    SET city = NEW.name WHERE public.geo_key(state) = public.geo_key(v_state) AND public.geo_key(city) = okey AND city <> NEW.name;
  ELSE
    UPDATE public.territories   SET state = NEW.name WHERE public.geo_key(state) = okey AND state <> NEW.name;
    UPDATE public.leads         SET state = NEW.name WHERE public.geo_key(state) = okey AND state <> NEW.name;
    UPDATE public.orders        SET state = NEW.name WHERE public.geo_key(state) = okey AND state <> NEW.name;
    UPDATE public.distributors  SET state = NEW.name WHERE public.geo_key(state) = okey AND state <> NEW.name;
    UPDATE public.dealers       SET state = NEW.name WHERE public.geo_key(state) = okey AND state <> NEW.name;
    UPDATE public.retailers     SET state = NEW.name WHERE public.geo_key(state) = okey AND state <> NEW.name;
    UPDATE public.company_settings SET state = NEW.name WHERE public.geo_key(state) = okey AND state <> NEW.name;
    UPDATE public.invoices      SET "sellerState" = NEW.name WHERE public.geo_key("sellerState") = okey AND "sellerState" <> NEW.name;
    UPDATE public.schemes s SET states = ARRAY(
        SELECT CASE WHEN public.geo_key(x.v) = okey THEN NEW.name ELSE x.v END
          FROM unnest(s.states) WITH ORDINALITY AS x(v, n) ORDER BY x.n)
     WHERE EXISTS (SELECT 1 FROM unnest(s.states) AS x(v) WHERE public.geo_key(x.v) = okey);
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS c_geo_rename_cascade ON public.geo_states;
CREATE TRIGGER c_geo_rename_cascade AFTER UPDATE OF name ON public.geo_states
  FOR EACH ROW EXECUTE FUNCTION public.geo_rename_cascade();
DROP TRIGGER IF EXISTS c_geo_rename_cascade ON public.geo_cities;
CREATE TRIGGER c_geo_rename_cascade AFTER UPDATE OF name ON public.geo_cities
  FOR EACH ROW EXECUTE FUNCTION public.geo_rename_cascade();

-- A city cannot move to another state (its rows would still name the old one).
CREATE OR REPLACE FUNCTION public.geo_city_state_fixed()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF NEW."stateId" IS DISTINCT FROM OLD."stateId" THEN
    RAISE EXCEPTION 'A city cannot be moved to another state. Add it under the right state instead.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS d_geo_city_state_fixed ON public.geo_cities;
CREATE TRIGGER d_geo_city_state_fixed BEFORE UPDATE ON public.geo_cities
  FOR EACH ROW EXECUTE FUNCTION public.geo_city_state_fixed();

-- ── 7. No hard delete while in use ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.geo_guard_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_state text; skey text; ckey text; v_used text;
BEGIN
  IF TG_TABLE_NAME = 'geo_states' THEN
    skey := public.geo_key(OLD.name);
    IF EXISTS (SELECT 1 FROM public.geo_cities WHERE "stateId" = OLD.id) THEN
      RAISE EXCEPTION 'Cannot delete the state %: it still has cities. Switch it off instead.', OLD.name;
    END IF;
    SELECT t INTO v_used FROM (
        SELECT 'leads' t FROM public.leads WHERE public.geo_key(state) = skey UNION ALL
        SELECT 'orders' FROM public.orders WHERE public.geo_key(state) = skey UNION ALL
        SELECT 'distributors' FROM public.distributors WHERE public.geo_key(state) = skey UNION ALL
        SELECT 'dealers' FROM public.dealers WHERE public.geo_key(state) = skey UNION ALL
        SELECT 'retailers' FROM public.retailers WHERE public.geo_key(state) = skey UNION ALL
        SELECT 'territories' FROM public.territories WHERE public.geo_key(state) = skey UNION ALL
        SELECT 'company settings' FROM public.company_settings WHERE public.geo_key(state) = skey UNION ALL
        SELECT 'invoices' FROM public.invoices WHERE public.geo_key("sellerState") = skey UNION ALL
        SELECT 'schemes' FROM public.schemes s WHERE EXISTS (SELECT 1 FROM unnest(s.states) x WHERE public.geo_key(x) = skey)
      ) u LIMIT 1;
  ELSE
    SELECT name INTO v_state FROM public.geo_states WHERE id = OLD."stateId";
    skey := public.geo_key(v_state); ckey := public.geo_key(OLD.name);
    SELECT t INTO v_used FROM (
        SELECT 'leads' t FROM public.leads WHERE public.geo_key(state) = skey AND public.geo_key(city) = ckey UNION ALL
        SELECT 'orders' FROM public.orders WHERE public.geo_key(state) = skey AND public.geo_key(city) = ckey UNION ALL
        SELECT 'distributors' FROM public.distributors WHERE public.geo_key(state) = skey AND public.geo_key(city) = ckey UNION ALL
        SELECT 'dealers' FROM public.dealers WHERE public.geo_key(state) = skey AND public.geo_key(city) = ckey UNION ALL
        SELECT 'retailers' FROM public.retailers WHERE public.geo_key(state) = skey AND public.geo_key(city) = ckey UNION ALL
        SELECT 'territories' FROM public.territories t2 WHERE public.geo_key(t2.state) = skey
           AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(t2.districts, '[]'::jsonb)) e WHERE public.geo_key(e) = ckey)
      ) u LIMIT 1;
  END IF;
  IF v_used IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete % %: it is still used in %. Switch it off instead.',
      CASE TG_TABLE_NAME WHEN 'geo_states' THEN 'the state' ELSE 'the city' END, OLD.name, v_used;
  END IF;
  RETURN OLD;
END $fn$;
DROP TRIGGER IF EXISTS geo_guard_delete ON public.geo_states;
CREATE TRIGGER geo_guard_delete BEFORE DELETE ON public.geo_states
  FOR EACH ROW EXECUTE FUNCTION public.geo_guard_delete();
DROP TRIGGER IF EXISTS geo_guard_delete ON public.geo_cities;
CREATE TRIGGER geo_guard_delete BEFORE DELETE ON public.geo_cities
  FOR EACH ROW EXECUTE FUNCTION public.geo_guard_delete();

-- ── 8. Sign-up pages (not signed in) read the active names ──────────────
CREATE OR REPLACE VIEW public.public_geo_states AS
  SELECT id, name FROM public.geo_states WHERE active;
CREATE OR REPLACE VIEW public.public_geo_cities AS
  SELECT c.id, c."stateId", c.name FROM public.geo_cities c JOIN public.geo_states s ON s.id = c."stateId"
   WHERE c.active AND s.active;
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER VIEW public.public_geo_states SET (security_invoker = off)';
    EXECUTE 'ALTER VIEW public.public_geo_cities SET (security_invoker = off)';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Could not set security_invoker (%). It is off by default.', SQLERRM;
  END;
END $$;
REVOKE ALL ON public.public_geo_states, public.public_geo_cities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_geo_states, public.public_geo_cities TO anon, authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('100_states_cities_masters.sql',
        'State and City masters (geo_states, geo_cities): seeded from the code lists + live values; add_city for Sales roles; rename cascades to territories/leads/orders/partners; no delete while in use')
ON CONFLICT (filename) DO NOTHING;
