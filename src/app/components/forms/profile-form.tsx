'use client';

import React, { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useActionState } from 'react';
import profileSchema, { type ProfileFormData } from '@/app/lib/validation/profile-schema';
import { updateProfileAction } from '@/app/lib/actions/update-profile-action';
import type { FormState } from '@/app/lib/types/form-state';
import { splitFullName } from '@/app/lib/utils/profile-utils';
import { COUNTRIES } from '@/app/lib/utils/countries';
import { US_STATES } from '@/app/lib/utils/states';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/forms/ui/form';
import { Input } from '@/app/components/forms/ui/input';
import { Button } from '@/app/components/forms/ui/button';
import { Checkbox } from '@/app/components/forms/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/forms/ui/card';
import { Alert, AlertDescription } from '@/app/components/forms/ui/alert';
import { AlertCircle } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/forms/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/forms/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';

interface ProfileFormProps {
  user: {
    name?: string | null;
    email?: string | null;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    country?: string | null;
    allowSmsNotifications?: boolean | null;
  };
}

const initialFormState: FormState = {
  success: false,
  hasTimeout: false,
  fields: {},
};

export default function ProfileForm({ user }: ProfileFormProps) {
  const [formState, action, isPending] = useActionState(updateProfileAction, initialFormState);
  const [countryOpen, setCountryOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [isTransitionPending, startTransition] = useTransition();
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Use direct firstName/lastName fields, with fallback to splitting the name
  const fallbackNames = splitFullName(user.name);
  const firstName = user.firstName || fallbackNames.firstName || '';
  const lastName = user.lastName || fallbackNames.lastName || '';

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: firstName,
      lastName: lastName,
      phone: user.phone ?? '',
      addressLine1: user.addressLine1 ?? '',
      addressLine2: user.addressLine2 ?? '',
      city: user.city ?? '',
      state: user.state ?? '',
      zipCode: user.zipCode ?? '',
      country: user.country ?? '',
      allowSmsNotifications: user.allowSmsNotifications ?? false,
    },
  });

  // Watch all form values to check if form has any content
  const watchedValues = form.watch();

  // Check if all personal profile fields are empty
  const hasFormContent = () => {
    const values = watchedValues;
    return !!(
      values.firstName?.trim() ||
      values.lastName?.trim() ||
      values.phone?.trim() ||
      values.addressLine1?.trim() ||
      values.addressLine2?.trim() ||
      values.city?.trim() ||
      values.state?.trim() ||
      values.zipCode?.trim() ||
      values.country?.trim() ||
      values.allowSmsNotifications
    );
  };

  const onSubmit = (data: ProfileFormData) => {
    const formData = new FormData();
    formData.append('firstName', data.firstName || '');
    formData.append('lastName', data.lastName || '');
    formData.append('phone', data.phone || '');
    formData.append('addressLine1', data.addressLine1 || '');
    formData.append('addressLine2', data.addressLine2 || '');
    formData.append('city', data.city || '');
    formData.append('state', data.state || '');
    formData.append('zipCode', data.zipCode || '');
    formData.append('country', data.country || '');
    formData.append('allowSmsNotifications', data.allowSmsNotifications ? 'true' : 'false');

    // Use startTransition to properly handle the async action
    startTransition(() => {
      action(formData);
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal Information (Optional)</CardTitle>
          <CardDescription>
            Update your personal details and contact information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {formState.success && (
            <Alert className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your profile has been updated successfully.
              </AlertDescription>
            </Alert>
          )}

          {formState.errors?.general && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {formState.errors.general[0]}
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your first name"
                          {...field}
                          onChange={(e) => {
                            setHasUserInteracted(true);
                            form.setValue('firstName', e.target.value, {
                              shouldDirty: true,
                              shouldValidate: true
                            });
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your last name"
                          {...field}
                          onChange={(e) => {
                            setHasUserInteracted(true);
                            form.setValue('lastName', e.target.value, {
                              shouldDirty: true,
                              shouldValidate: true
                            });
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="(555) 123-4567"
                        type="tel"
                        {...field}
                        onChange={(e) => {
                          setHasUserInteracted(true);
                          form.setValue('phone', e.target.value, {
                            shouldDirty: true,
                            shouldValidate: true
                          });
                          field.onChange(e);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowSmsNotifications"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          setHasUserInteracted(true);
                          const boolValue = checked === true;
                          form.setValue('allowSmsNotifications', boolValue, {
                            shouldDirty: true,
                            shouldValidate: true
                          });
                          field.onChange(boolValue);
                        }}
                        id="allow-sms-notifications"
                      />
                    </FormControl>
                    <FormLabel className="block text-sm font-normal" htmlFor="allow-sms-notifications">
                      <strong>Allow us to send text messages to your mobile phone occasionally?</strong>
                      <br />
                      <em className='inline-block mt-3'>(Carrier charges may apply)</em>
                    </FormLabel>
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Address Information</h3>

                <FormField
                  control={form.control}
                  name="addressLine1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="123 Main Street"
                          {...field}
                          onChange={(e) => {
                            setHasUserInteracted(true);
                            form.setValue('addressLine1', e.target.value, {
                              shouldDirty: true,
                              shouldValidate: true
                            });
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="addressLine2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address Line 2</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Apartment, suite, unit, etc."
                          {...field}
                          onChange={(e) => {
                            setHasUserInteracted(true);
                            form.setValue('addressLine2', e.target.value, {
                              shouldDirty: true,
                              shouldValidate: true
                            });
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="New York"
                            {...field}
                            onChange={(e) => {
                              setHasUserInteracted(true);
                              form.setValue('city', e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true
                              });
                              field.onChange(e);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <Popover open={stateOpen} onOpenChange={setStateOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={stateOpen}
                                className="w-full justify-between"
                              >
                                {field.value
                                  ? (() => {
                                      const selectedState = US_STATES.find((state) => state.code === field.value);
                                      return selectedState ? `${selectedState.name} - ${selectedState.code}` : "Select a state...";
                                    })()
                                  : "Select a state..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search states..." />
                              <CommandEmpty>No state found.</CommandEmpty>
                              <CommandList>
                                <CommandGroup>
                                  {US_STATES.map((state) => (
                                    <CommandItem
                                      key={state.code}
                                      value={state.name.toLowerCase()}
                                      onSelect={(currentValue) => {
                                        setHasUserInteracted(true);
                                        const selectedState = US_STATES.find(
                                          (s) => s.name.toLowerCase() === currentValue
                                        );
                                        if (selectedState) {
                                          form.setValue('state', selectedState.code, {
                                            shouldDirty: true,
                                            shouldValidate: true
                                          });
                                          field.onChange(selectedState.code);
                                        }
                                        setStateOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 ${
                                          field.value === state.code ? "opacity-100" : "opacity-0"
                                        }`}
                                      />
                                      {state.name} - {state.code}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="zipCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ZIP / Postal Code</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="12345"
                            {...field}
                            onChange={(e) => {
                              setHasUserInteracted(true);
                              form.setValue('zipCode', e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true
                              });
                              field.onChange(e);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={countryOpen}
                              className="w-full justify-between"
                            >
                              {field.value
                                ? COUNTRIES.find((country) => country.code === field.value)?.name
                                : "Select a country..."}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search countries..." />
                            <CommandEmpty>No country found.</CommandEmpty>
                            <CommandList>
                              <CommandGroup>
                                {COUNTRIES.map((country) => (
                                  <CommandItem
                                    key={country.code}
                                    value={country.name.toLowerCase()}
                                      onSelect={(currentValue) => {
                                      setHasUserInteracted(true);
                                      const selectedCountry = COUNTRIES.find(
                                        (c) => c.name.toLowerCase() === currentValue
                                      );
                                      if (selectedCountry) {
                                        form.setValue('country', selectedCountry.code, {
                                          shouldDirty: true,
                                          shouldValidate: true
                                        });
                                        field.onChange(selectedCountry.code);
                                      }
                                      setCountryOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={`mr-2 h-4 w-4 ${
                                        field.value === country.code ? "opacity-100" : "opacity-0"
                                      }`}
                                    />
                                    {country.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                disabled={isPending || isTransitionPending || !hasUserInteracted || !hasFormContent()}
              >
                {isPending || isTransitionPending ? 'Updating...' : 'Update Profile'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
          <CardDescription>
            Manage your account credentials and preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">Email Address</div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
            </div>
            <Button variant="outline" size="sm">
              Change
            </Button>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">Username</div>
              <div className="text-sm text-muted-foreground">
                {`@${user.username}` || 'Not set'}
              </div>
            </div>
            <Button variant="outline" size="sm">
              Change
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}