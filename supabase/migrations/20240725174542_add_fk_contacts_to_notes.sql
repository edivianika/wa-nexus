ALTER TABLE public.contact_notes
ADD COLUMN contact_id INTEGER;

CREATE INDEX idx_contact_notes_contact_id ON public.contact_notes(contact_id);

ALTER TABLE public.contact_notes
ADD CONSTRAINT fk_contact_notes_contact_id
FOREIGN KEY (contact_id)
REFERENCES public.contacts(id)
ON DELETE CASCADE; 