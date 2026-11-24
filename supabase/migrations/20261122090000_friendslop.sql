alter table games add column if not exists friendslop boolean;
update games set friendslop = true where name = 'PEAK' and friendslop is null;
update games set friendslop = false where name = 'Rec Room' and friendslop is null;
