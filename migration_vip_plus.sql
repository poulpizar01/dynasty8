-- VIP PLUS remplace l'ancien système à deux paliers (VIP / VIP+) : les biens
-- encore marqués "vip+" repassent simplement à "vip" (même badge affiché).
UPDATE biens SET vip = 'vip' WHERE vip = 'vip+';
