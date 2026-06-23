update public.system_template_variants
set
  colors = case
    when colors ? 'android-main-body-color' then
      (colors - 'android-main-body-color') ||
      case when colors ? 'android-tab-paragraph-color' then '{}'::jsonb
        else jsonb_build_object('android-tab-paragraph-color', colors -> 'android-main-body-color') end
    else colors
  end,
  candidate_selections = case
    when candidate_selections ? 'android-main-body-color' then
      (candidate_selections - 'android-main-body-color') ||
      case when candidate_selections ? 'android-tab-paragraph-color' then '{}'::jsonb
        else jsonb_build_object(
          'android-tab-paragraph-color',
          to_jsonb(regexp_replace(candidate_selections ->> 'android-main-body-color', '^android-main-body-color:', 'android-tab-paragraph-color:'))
        ) end
    else candidate_selections
  end
where platform = 'android'
  and (colors ? 'android-main-body-color' or candidate_selections ? 'android-main-body-color');

update public.system_template_variants
set
  colors = case
    when colors ? 'android-main-paragraph-pressed-color' then
      (colors - 'android-main-paragraph-pressed-color') ||
      case when colors ? 'android-tab-paragraph-pressed-color' then '{}'::jsonb
        else jsonb_build_object('android-tab-paragraph-pressed-color', colors -> 'android-main-paragraph-pressed-color') end
    else colors
  end,
  candidate_selections = case
    when candidate_selections ? 'android-main-paragraph-pressed-color' then
      (candidate_selections - 'android-main-paragraph-pressed-color') ||
      case when candidate_selections ? 'android-tab-paragraph-pressed-color' then '{}'::jsonb
        else jsonb_build_object(
          'android-tab-paragraph-pressed-color',
          to_jsonb(regexp_replace(candidate_selections ->> 'android-main-paragraph-pressed-color', '^android-main-paragraph-pressed-color:', 'android-tab-paragraph-pressed-color:'))
        ) end
    else candidate_selections
  end
where platform = 'android'
  and (colors ? 'android-main-paragraph-pressed-color' or candidate_selections ? 'android-main-paragraph-pressed-color');
